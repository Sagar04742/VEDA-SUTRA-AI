import { buildSystemPrompt, lengthReminder } from '../prompt.js';
import { executeTool, isSolverTool, toolDeclarations, webSearchDeclaration } from '../tools.js';
import { firstToolFor } from '../intent.js';
import { describeCall, describeResult } from '../activity.js';

// Error from a provider's HTTP API, with what the chain runner needs to decide what to do next.
export class ProviderError extends Error {
  constructor(message, { status, retryAfterSeconds, kind } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.kind = kind; // 'tool_failed' when the model produced a broken tool call
  }
}

const MAX_TOOL_ROUNDS = 5;
const DEEP_TOOL_ROUNDS = 8;

// Our turns -> OpenAI-style chat messages (Groq, OpenAI and Mistral all speak this shape).
// wrapImage turns {mimeType,data} into the provider's image part.
export function toChatMessages(systemPrompt, turns, wrapImage, reminder = '') {
  const out = [{ role: 'system', content: systemPrompt }];
  for (const t of turns) {
    if (t.role === 'assistant') {
      out.push({ role: 'assistant', content: t.content ?? '' });
      continue;
    }
    if (t.images?.length) {
      out.push({ role: 'user', content: [...t.images.map(wrapImage), ...(t.content ? [{ type: 'text', text: t.content }] : [])] });
    } else out.push({ role: 'user', content: t.content ?? '' });
  }
  // Repeat the length limit beside the newest question (not saved anywhere, only sent to the model).
  const last = out.at(-1);
  if (reminder && last?.role === 'user') {
    if (typeof last.content === 'string') last.content = `${last.content}\n\n[${reminder}]`;
    else last.content = [...last.content, { type: 'text', text: `[${reminder}]` }];
  }
  return out;
}

export const asFunctionTools = (decls) => decls.map((d) => ({ type: 'function', function: { name: d.name, description: d.description, parameters: d.parametersJsonSchema } }));

// forceTool ('searchKnowledge' | 'searchWeb' | 'solver') -> the OpenAI-style tool_choice value.
export const toolChoiceFor = (forceTool) => (!forceTool ? 'auto' : forceTool === 'solver' ? 'required' : { type: 'function', function: { name: forceTool } });

// The first turn of an answer must use the right tool: the exact solver for a calculation, the knowledge base for a
// question (smaller models otherwise answer from memory). If "Web search" is on, the second turn must search the web,
// so the toggle really does something. A picture without a calculation is left to the model.
export function planTools(lastTurn, { webSearch } = {}) {
  const asksCalc = firstToolFor(lastTurn?.content) === 'solver';
  const first = lastTurn?.images?.length && !asksCalc ? null : firstToolFor(lastTurn?.content);
  return { first, second: webSearch && first === 'searchKnowledge' ? 'searchWeb' : null };
}

// The shared "model -> tools -> model" loop for chat-completions style providers.
//
// adapter = {
//   stream({ messages, tools, forceTool, signal }) -> async iterable of { text?: string, toolCalls?: [{ index, id, name, args }] }  (deltas)
//   assistantToolMessage(text, calls)   -> the message that records the tool calls
//   toolMessage(call, content)          -> the message carrying one tool's result
//   wrapImage({ mimeType, data })       -> provider image part
// }
// Returns { text, solver, sources, toolsUsed, activity, aborted }. Same contract as the Gemini service.
export async function runToolLoop(adapter, { messages, signal, options = {}, onToken = () => {}, onSolver = () => {}, onActivity = () => {}, toolContext = {} }, shared) {
  const wire = toChatMessages(buildSystemPrompt(options), messages, adapter.wrapImage, lengthReminder(options));
  const maxRounds = options.deepExplain ? DEEP_TOOL_ROUNDS : MAX_TOOL_ROUNDS;
  const declarations = [...toolDeclarations, ...(options.webSearch ? [webSearchDeclaration] : [])]; // no Google Search here: Wikipedia tool instead
  const plan = planTools(messages.at(-1), options);
  const solver = [];
  const sources = new Map();
  const toolsUsed = [];
  const activity = [];
  const retrieved = []; // the web pages the model actually read (Pramana can check its claims against them)
  let text = '';
  const result = (aborted) => ({ text, solver, sources: [...sources.values()], toolsUsed, activity, retrieved, aborted });

  for (let round = 0; round <= maxRounds; round++) {
    const useTools = round < maxRounds; // last round: no tools, so the model must answer in words
    let roundText = '';
    const calls = new Map(); // index -> { id, name, args }
    const forceTool = !useTools ? null : round === 0 ? plan.first : round === 1 && !toolsUsed.includes('searchWeb') ? plan.second : null;

    try {
      for await (const d of adapter.stream({ messages: wire, tools: useTools ? asFunctionTools(declarations) : undefined, forceTool, signal })) {
        if (signal?.aborted) break;
        if (d.text) {
          if (!roundText && text && !text.endsWith('\n')) {
            text += '\n\n';
            onToken('\n\n');
          }
          roundText += d.text;
          text += d.text;
          shared.shownText = true;
          onToken(d.text);
        }
        for (const c of d.toolCalls ?? []) {
          const cur = calls.get(c.index ?? 0) ?? { id: '', name: '', args: '' };
          calls.set(c.index ?? 0, { id: c.id || cur.id, name: c.name || cur.name, args: cur.args + (c.args ?? '') });
        }
      }
    } catch (err) {
      if (signal?.aborted) return result(true);
      throw err;
    }

    if (signal?.aborted) return result(true);
    // Some providers omit tool-call ids; make sure every call has one so results can be matched back.
    const list = [...calls.values()].filter((c) => c.name).map((c, i) => ({ ...c, id: c.id || `call_${round}_${i}` }));
    if (!list.length || !useTools) return result(false);

    wire.push(adapter.assistantToolMessage(roundText, list));
    for (const call of list) {
      let args = {};
      try {
        args = call.args ? JSON.parse(call.args) : {};
      } catch {
        args = {};
      }
      toolsUsed.push(call.name);
      const what = describeCall(call.name, args);
      onActivity({ id: call.id, phase: 'start', tool: call.name, ...what });
      const out = await executeTool(call.name, args, toolContext);
      const outcome = describeResult(call.name, out);
      onActivity({ id: call.id, phase: 'done', tool: call.name, kind: what.kind, text: what.text, result: outcome.text, count: outcome.count, items: outcome.items, entries: outcome.entries, pages: outcome.pages });
      activity.push({ tool: call.name, kind: what.kind, text: what.text, result: outcome.text, count: outcome.count, items: outcome.items, entries: outcome.entries, pages: outcome.pages });
      if (call.name === 'searchWeb') for (const r of out.results ?? []) {
        if (!sources.has(r.url)) sources.set(r.url, { title: r.title, uri: r.url });
        if (r.extract) retrieved.push({ kind: 'web', title: r.title, url: r.url, text: r.extract });
      }
      if (isSolverTool(call.name) && !out.error) {
        const entry = { tool: call.name, args, method: out.method, answer: out.answer, steps: out.steps };
        solver.push(entry);
        const key = JSON.stringify([entry.tool, entry.args]);
        if (!shared.shownSolver.has(key)) {
          shared.shownSolver.add(key);
          onSolver(entry);
        }
      }
      wire.push(adapter.toolMessage(call, JSON.stringify(out)));
    }
  }
  return result(false);
}
