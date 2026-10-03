import { GoogleGenAI } from '@google/genai';
import { buildSystemPrompt } from './prompt.js';
import { executeTool, isSolverTool, toolDeclarations } from './tools.js';
import { humanDuration, parseQuotaError } from '../utils/quota.js';

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
  const status = err?.status ?? err?.code;
  if (status === 401 || status === 403) return { message: 'The AI service rejected the API key. Check GEMINI_API_KEY on the server.', code: 'auth' };
  if (status === 404) return { message: 'The AI model was not found. Check GEMINI_MODEL on the server.', code: 'model' };
  return { message: 'The AI service could not complete the answer. Please try again.', code: 'ai_error' };
}

// client is injectable so tests (and the dev mock) can stand in for the real SDK.
export function createGeminiService({ apiKey, model, client } = {}) {
  let sdk = client;
  const getClient = () => (sdk ??= new GoogleGenAI({ apiKey }));

  return {
    configError() {
      if (client) return null;
      if (!apiKey) return 'Gemini is not configured: set GEMINI_API_KEY in server/.env.';
      if (!model) return 'Gemini is not configured: set GEMINI_MODEL in server/.env.';
      return null;
    },

    // Streams an answer. messages = full conversation (already trimmed, ending with the new user turn).
    // Handles tool calls in a loop: model -> tool -> model, streaming text tokens the whole way.
    // options: { webSearch, deepExplain }. Returns { text, solver, sources, aborted }.
    async streamChat({ messages, signal, options = {}, onToken = () => {}, onSolver = () => {}, onNotice = () => {}, toolContext = {} }) {
      const contents = toContents(messages);
      const systemInstruction = buildSystemPrompt(options);
      const maxRounds = options.deepExplain ? DEEP_TOOL_ROUNDS : MAX_TOOL_ROUNDS;
      const solver = [];
      const sources = new Map();
      let useSearch = Boolean(options.webSearch);
      let text = '';
      const result = (aborted) => ({ text, solver, sources: [...sources.values()], aborted });

      for (let round = 0; round <= maxRounds; round++) {
        // On the last allowed round, withhold the tools so the model must answer in text.
        const useTools = round < maxRounds;
        let modelParts;
        let calls;
        let roundHasText;

        // One attempt per loop; if Google Search is rejected by this model we retry once without it.
        for (;;) {
          modelParts = [];
          calls = [];
          roundHasText = false;
          const tools = useTools ? [{ functionDeclarations: toolDeclarations }, ...(useSearch ? [{ googleSearch: {} }] : [])] : [];
          try {
            const stream = await getClient().models.generateContentStream({
              model,
              contents,
              config: { systemInstruction, ...(tools.length ? { tools } : {}), abortSignal: signal },
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
                  text += part.text;
                  onToken(part.text);
                }
              }
            }
            break;
          } catch (err) {
            if (signal?.aborted) return result(true); // keep the partial answer
            // Some models cannot combine Google Search with our tools: carry on without it, and say so.
            if (useSearch && useTools && !roundHasText && (err?.status ?? err?.code) === 400) {
              useSearch = false;
              onNotice('Web search is not available with the current AI model, so this answer uses the knowledge base only.');
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
          const out = await executeTool(call.name, call.args ?? {}, toolContext);
          if (isSolverTool(call.name) && !out.error) {
            const entry = { tool: call.name, args: call.args ?? {}, method: out.method, answer: out.answer, steps: out.steps };
            solver.push(entry);
            onSolver(entry);
          }
          responses.push({ functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response: out } });
        }
        contents.push({ role: 'user', parts: responses });
      }

      return result(false);
    },
  };
}
