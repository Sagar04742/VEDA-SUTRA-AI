import { GoogleGenAI } from '@google/genai';
import { buildSystemPrompt } from './prompt.js';
import { executeTool, isSolverTool, solverToolNames, toolDeclarations, webSearchDeclaration } from './tools.js';
import { planTools } from './providers/toolLoop.js';
import { describeCall, describeResult } from './activity.js';
import { humanDuration, isSwitchable, parseQuotaError } from '../utils/quota.js';

const SEARCH_BLOCK_MS = 30 * 60 * 1000;
const MAX_TOOL_ROUNDS = 5;
const DEEP_TOOL_ROUNDS = 8;

// Turn our turns into Gemini "contents". Pictures go first, then the text.
const toContents = (messages) =>
  messages.map((m) => {
    const parts = (m.images ?? []).map((i) => ({ inlineData: { mimeType: i.mimeType, data: i.data } }));
    if (m.content) parts.push({ text: m.content });
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });

// Friendly, non-leaky error info for the user: { message, code, retryAfterSeconds }.
export function describeAiError(err) {
  const quota = parseQuotaError(err);
  if (quota.rateLimited) {
    const wait = quota.retryAfterSeconds;
    const message = quota.daily
      ? 'The free daily limit for the AI service has been reached. Please try again later; daily limits usually reset within 24 hours.'
      : wait
        ? `The free usage limit was reached. Please try again in ${humanDuration(wait)}.`
        : 'The AI service is busy or over its free usage limit. Please try again in a minute or two.';
    return { message, code: 'rate_limit', retryAfterSeconds: quota.daily ? null : wait ?? 60, daily: quota.daily };
  }
  const status = err?.status ?? err?.statusCode ?? err?.code;
  if (status === 401 || status === 403) return { message: 'The AI service rejected an API key. Check the keys in server/.env.', code: 'auth' };
  if (status === 404) return { message: 'The AI model was not found. Check the model names (GEMINI_MODEL, TIER_*) in server/.env.', code: 'model' };
  return { message: 'The AI service could not complete the answer. Please try again.', code: 'ai_error' };
}

// client is injectable so tests (and the dev mock) can stand in for the real SDK.
// fallbackModel (optional): a second model with its own free-tier quota, used when the main one is rate limited.
export function createGeminiService({ apiKey, model, fallbackModel, client, retryDelayMs = 1200 } = {}) {
  let sdk = client;
  const getClient = () => (sdk ??= new GoogleGenAI({ apiKey }));
  // Google Search is not part of every plan. Once it has been refused we stop trying for a while (and the UI greys the toggle).
  const search = { blockedUntil: 0 };
  const searchBlocked = () => Date.now() < search.blockedUntil;
  const blockSearch = () => (search.blockedUntil = Date.now() + SEARCH_BLOCK_MS);

  return {
    // One tiny real request: can this model answer right now? (The readiness check.)
    async ping(modelName) {
      if (client) return;
      const out = await getClient().models.generateContent({ model: modelName, contents: 'Reply with the single word OK.', config: { maxOutputTokens: 64 } });
      if (!out?.candidates?.length) throw Object.assign(new Error('The reply was empty.'), { status: 502 });
    },

    // Does the key work and does the model exist? Asks for the model's description: no generation quota is used.
    async check(modelName) {
      if (client) return { ok: true };
      try {
        await getClient().models.get({ model: modelName });
        return { ok: true };
      } catch (err) {
        const status = err?.status ?? err?.code;
        if (status === 401 || status === 403 || /API key/i.test(String(err?.message))) return { ok: false, status: 401, reason: 'key rejected' };
        if (status === 404) return { ok: false, status: 404, reason: 'model not found' };
        return { ok: true, unverified: true }; // busy, offline...: do not hold it against the model
      }
    },

    configError() {
      if (client) return null;
      if (!apiKey) return 'Gemini is not configured: set GEMINI_API_KEY in server/.env.';
      if (!model) return 'Gemini is not configured: set GEMINI_MODEL in server/.env.';
      return null;
    },

    // What this key can do right now (shown by the UI).
    // Web search always works: Google Search when the plan includes it, otherwise our Wikipedia search tool.
    capabilities: () => ({ webSearch: true, webSearchSource: searchBlocked() ? 'Wikipedia' : 'Google Search' }),

    // One tiny request at start-up so the Web search toggle is correct before anyone clicks it.
    async probeWebSearch() {
      try {
        await getClient().models.generateContent({ model, contents: 'Reply OK', config: { tools: [{ googleSearch: {} }], maxOutputTokens: 5 } });
        search.blockedUntil = 0;
      } catch (err) {
        const status = err?.status ?? err?.code;
        // A real per-minute limit says how long to wait; "quota 0" or a plain refusal does not.
        if ([400, 403].includes(status) || (status === 429 && parseQuotaError(err).retryAfterSeconds == null)) blockSearch();
      }
    },

    // Runs one model once (no fallback). Used by the cross-provider chain.
    runModel: (modelName, args, shared) => runOnce(modelName, args, shared),

    // Streams an answer. messages = full conversation (already trimmed, ending with the new user turn).
    // Handles tool calls in a loop: model -> tool -> model, streaming text tokens the whole way.
    // options: { webSearch, deepExplain }. Returns { text, solver, sources, aborted }.
    // If the main model is rate limited before anything was shown, the whole answer restarts on fallbackModel.
    async streamChat(args) {
      // args.models = [{ id, label }] lets the caller choose a chain (the model picker does); otherwise model, then fallbackModel.
      const chain = args.models?.length ? args.models : [{ id: model }, ...(fallbackModel ? [{ id: fallbackModel }] : [])];
      const shared = { shownText: false, shownSolver: new Set() };
      for (let i = 0; i < chain.length; i++) {
        try {
          const result = await runOnce(chain[i].id, args, shared);
          // One notice, naming the level the user chose and the one that really answered (not every hop in between).
          if (i > 0 && chain[0].label && chain[i].label && chain[0].label !== chain[i].label) {
            args.onNotice?.(`${chain[0].label} is busy or at its free usage limit right now, so this answer came from ${chain[i].label}.`);
          }
          return result;
        } catch (err) {
          const next = chain[i + 1];
          if (!next || !isSwitchable(err) || shared.shownText || args.signal?.aborted) throw err;
          console.warn(`Model ${chain[i].id} unavailable (${err?.status ?? 'error'}); answering with ${next.id} instead.`);
        }
      }
    },
  };

  async function runOnce(modelName, { messages, signal, options = {}, onToken = () => {}, onSolver = () => {}, onNotice = () => {}, onActivity = () => {}, toolContext = {} }, shared) {
    const contents = toContents(messages);
    const systemInstruction = buildSystemPrompt(options);
    const maxRounds = options.deepExplain ? DEEP_TOOL_ROUNDS : MAX_TOOL_ROUNDS;
    const plan = planTools(messages.at(-1), options); // which tool each of the first turns must call
    const solver = [];
    const toolsUsed = [];
    const activity = [];
    const retrieved = [];
    const sources = new Map();
    // Web search: Google Search when the plan allows it, otherwise our own Wikipedia search tool.
    let useSearch = Boolean(options.webSearch) && !searchBlocked();
    let useWiki = Boolean(options.webSearch) && !useSearch;
    let text = '';
    const result = (aborted) => ({ text, solver, sources: [...sources.values()], toolsUsed, activity, retrieved, aborted });

    for (let round = 0; round <= maxRounds; round++) {
      // On the last allowed round, withhold the tools so the model must answer in text.
      const useTools = round < maxRounds;
      let modelParts;
      let calls;
      let roundHasText;
      let busyRetries = 0;

      // One attempt per loop; if Google Search is rejected by this model we retry once without it.
      for (;;) {
        modelParts = [];
        calls = [];
        roundHasText = false;
        const declarations = [...toolDeclarations, ...(useWiki ? [webSearchDeclaration] : [])];
        const tools = useTools ? [{ functionDeclarations: declarations }, ...(useSearch ? [{ googleSearch: {} }] : [])] : [];
        const forceNow = !useTools ? null : round === 0 ? plan.first : round === 1 && useWiki && !toolsUsed.includes('searchWeb') ? plan.second : null;
        try {
          const stream = await getClient().models.generateContentStream({
            model: modelName,
            contents,
            config: {
              systemInstruction,
              ...(tools.length ? { tools } : {}),
              // First turn: the model must call the right tool (the exact solver or the knowledge base); with Web search
              // on, the second turn must search Wikipedia. (Not combinable with Google Search grounding.)
              ...(forceNow && tools.length && !useSearch ? { toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: forceNow === 'solver' ? solverToolNames : [forceNow] } } } : {}),
              abortSignal: signal,
            },
          });

          for await (const chunk of stream) {
            if (signal?.aborted) break;
            const candidate = chunk.candidates?.[0];
            for (const c of candidate?.groundingMetadata?.groundingChunks ?? []) {
              if (c.web?.uri && !sources.has(c.web.uri)) sources.set(c.web.uri, { title: c.web.title || c.web.uri, uri: c.web.uri });
            }
            for (const part of candidate?.content?.parts ?? []) {
              modelParts.push(part);
              if (part.functionCall) calls.push(part.functionCall);
              else if (part.text && !part.thought) {
                // Separate text from different rounds (e.g. a preamble before a tool call).
                if (!roundHasText && text && !text.endsWith('\n')) {
                  text += '\n\n';
                  onToken('\n\n');
                }
                roundHasText = true;
                shared.shownText = true;
                text += part.text;
                onToken(part.text);
              }
            }
          }
          break;
        } catch (err) {
          if (signal?.aborted) return result(true); // keep the partial answer
          const status = err?.status ?? err?.code;
          // Google Search is not available on every model or plan (it can be refused as a bad request,
          // forbidden, or "quota 0" on free keys): switch to our own Wikipedia search tool and try again.
          if (useSearch && useTools && !roundHasText && [400, 403, 429].includes(status)) {
            useSearch = false;
            useWiki = true;
            if (status !== 429 || parseQuotaError(err).retryAfterSeconds == null) blockSearch();
            continue;
          }
          // A busy model (500/503) is usually back within a second: retry once before any text was sent.
          if ([500, 503].includes(status) && !roundHasText && busyRetries < 1) {
            busyRetries++;
            await new Promise((r) => setTimeout(r, retryDelayMs));
            continue;
          }
          throw err;
        }
      }

      if (signal?.aborted) return result(true);
      if (calls.length === 0 || !useTools) return result(false);

      // Run every requested tool, then give the results back to the model.
      contents.push({ role: 'model', parts: modelParts });
      const responses = [];
      for (const call of calls) {
        toolsUsed.push(call.name);
        const what = describeCall(call.name, call.args ?? {});
        const callId = call.id ?? `call_${round}_${toolsUsed.length}`;
        onActivity({ id: callId, phase: 'start', tool: call.name, ...what });
        const out = await executeTool(call.name, call.args ?? {}, toolContext);
        const outcome = describeResult(call.name, out);
        onActivity({ id: callId, phase: 'done', tool: call.name, kind: what.kind, text: what.text, result: outcome.text, count: outcome.count, items: outcome.items, entries: outcome.entries, pages: outcome.pages });
        activity.push({ tool: call.name, kind: what.kind, text: what.text, result: outcome.text, count: outcome.count, items: outcome.items, entries: outcome.entries, pages: outcome.pages });
        if (call.name === 'searchWeb') {
          for (const r of out.results ?? []) {
            if (!sources.has(r.url)) sources.set(r.url, { title: r.title, uri: r.url });
            if (r.extract) retrieved.push({ kind: 'web', title: r.title, url: r.url, text: r.extract });
          }
        }
        if (isSolverTool(call.name) && !out.error) {
          const entry = { tool: call.name, args: call.args ?? {}, method: out.method, answer: out.answer, steps: out.steps };
          solver.push(entry);
          const key = JSON.stringify([entry.tool, entry.args]);
          if (!shared.shownSolver.has(key)) {
            shared.shownSolver.add(key); // a restart on the fallback model must not show the same steps twice
            onSolver(entry);
          }
        }
        responses.push({ functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response: out } });
      }
      contents.push({ role: 'user', parts: responses });
    }

    return result(false);
  }
}
