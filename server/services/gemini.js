import { GoogleGenAI } from '@google/genai';
import { SYSTEM_PROMPT } from './prompt.js';
import { executeTool, isSolverTool, toolDeclarations } from './tools.js';

const MAX_TOOL_ROUNDS = 5;

// Turn our {role, content} messages into Gemini "contents".
const toContents = (messages) =>
  messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

// Friendly, non-leaky message for errors coming from the Gemini API.
export function describeAiError(err) {
  const status = err?.status ?? err?.code;
  if (status === 429) return 'The AI service is busy or over its quota. Please try again in a moment.';
  if (status === 401 || status === 403) return 'The AI service rejected the API key. Check GEMINI_API_KEY on the server.';
  if (status === 404) return 'The AI model was not found. Check GEMINI_MODEL on the server.';
  return 'The AI service could not complete the answer. Please try again.';
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
    // Returns { text, solver, aborted }.
    async streamChat({ messages, signal, onToken = () => {}, onSolver = () => {}, toolContext = {} }) {
      const contents = toContents(messages);
      const solver = [];
      let text = '';

      for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
        // On the last allowed round, withhold the tools so the model must answer in text.
        const useTools = round < MAX_TOOL_ROUNDS;
        const modelParts = [];
        const calls = [];
        let roundHasText = false;

        try {
          const stream = await getClient().models.generateContentStream({
            model,
            contents,
            config: {
              systemInstruction: SYSTEM_PROMPT,
              ...(useTools ? { tools: [{ functionDeclarations: toolDeclarations }] } : {}),
              abortSignal: signal,
            },
          });

          for await (const chunk of stream) {
            if (signal?.aborted) break;
            for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
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
        } catch (err) {
          if (signal?.aborted) return { text, solver, aborted: true }; // keep the partial answer
          throw err;
        }

        if (signal?.aborted) return { text, solver, aborted: true };
        if (calls.length === 0 || !useTools) return { text, solver, aborted: false };

        // Run every requested tool, then give the results back to the model.
        contents.push({ role: 'model', parts: modelParts });
        const responses = [];
        for (const call of calls) {
          const result = await executeTool(call.name, call.args ?? {}, toolContext);
          if (isSolverTool(call.name) && !result.error) {
            const entry = { tool: call.name, args: call.args ?? {}, method: result.method, answer: result.answer, steps: result.steps };
            solver.push(entry);
            onSolver(entry);
          }
          responses.push({ functionResponse: { name: call.name, ...(call.id ? { id: call.id } : {}), response: result } });
        }
        contents.push({ role: 'user', parts: responses });
      }

      return { text, solver, aborted: false };
    },
  };
}
