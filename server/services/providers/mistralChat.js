import { Mistral } from '@mistralai/mistralai';
import { ProviderError, runToolLoop, toolChoiceFor } from './toolLoop.js';
import { createModelCheck } from './modelCheck.js';

// Mistral chat with tools and streaming, through the official SDK. (Titles are made by Cohere now.)
// Mistral calls "required" by the name "any".
const mistralChoice = (choice) => (choice === 'required' ? 'any' : choice);

// Hard ceiling on the answer length, a backstop for when the model ignores the word limit.
const MAX_TOKENS = { brief: 450, balanced: 1000, thorough: 2200 };

const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => p.text ?? '').join('') : '');

// Turn SDK errors into ProviderError so the chain runner can read the status.
function wrap(err) {
  if (err instanceof ProviderError) return err;
  const status = err?.statusCode ?? err?.status;
  const retry = Number(err?.headers?.get?.('retry-after'));
  return new ProviderError(String(err?.message ?? 'Mistral error'), { status, retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : undefined });
}

export function createMistralChatProvider({ apiKey, client, fetchImpl } = {}) {
  let sdk = client;
  const getClient = () => (sdk ??= new Mistral({ apiKey }));

  const adapter = (model, options = {}) => ({
    wrapImage: ({ mimeType, data }) => ({ type: 'image_url', imageUrl: `data:${mimeType};base64,${data}` }),
    assistantToolMessage: (text, calls) => ({
      role: 'assistant',
      content: text || '',
      toolCalls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' } })),
    }),
    toolMessage: (call, content) => ({ role: 'tool', toolCallId: call.id, name: call.name, content }),

    async *stream({ messages, tools, forceTool, signal }) {
      let stream;
      try {
        stream = await getClient().chat.stream(
          { model, messages, temperature: 0.3, maxTokens: MAX_TOKENS[options.deepExplain ? 'thorough' : options.style] ?? 1000, ...(tools ? { tools, toolChoice: mistralChoice(toolChoiceFor(forceTool)) } : {}) },
          { fetchOptions: { signal } }
        );
        let finished = false;
        for await (const event of stream) {
          if (event.data?.choices?.[0]?.finishReason) finished = true;
          const delta = event.data?.choices?.[0]?.delta;
          if (!delta) continue;
          yield {
            text: textOf(delta.content) || undefined,
            toolCalls: delta.toolCalls?.map((t, i) => ({
              index: t.index ?? i,
              id: t.id && t.id !== 'null' ? t.id : undefined,
              name: t.function?.name,
              args: typeof t.function?.arguments === 'string' ? t.function.arguments : t.function?.arguments ? JSON.stringify(t.function.arguments) : undefined,
            })),
          };
        }
        if (!finished && !signal?.aborted) throw new ProviderError('The answer stopped arriving before it was finished.', { status: 502 });
      } catch (err) {
        throw wrap(err);
      }
    },
  });

  // Mistral lists each model with its aliases ("ministral-14b-latest" is an alias of a dated model).
  const check = client
    ? async () => ({ ok: true })
    : createModelCheck({ url: 'https://api.mistral.ai/v1/models', headers: { authorization: `Bearer ${apiKey}` }, idsOf: (b) => (b.data ?? []).flatMap((m) => [m.id, ...(m.aliases ?? [])]), fetchImpl });

  return {
    name: 'mistral',
    configured: () => Boolean(client || apiKey),
    ping: async (model) => {
      try {
        const out = await getClient().chat.complete({ model, messages: [{ role: 'user', content: 'Reply with the single word OK.' }], maxTokens: 16 });
        if (!out?.choices?.length) throw new ProviderError('The reply was empty.', { status: 502 });
      } catch (err) {
        throw wrap(err);
      }
    },
    check,
    run: (model, args, shared) => runToolLoop(adapter(model, args.options), args, shared),
  };
}
