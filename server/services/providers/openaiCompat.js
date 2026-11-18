import { ProviderError, runToolLoop, toolChoiceFor } from './toolLoop.js';
import { createModelCheck } from './modelCheck.js';

// Providers that speak the OpenAI "chat completions" API over plain fetch: Groq, OpenAI itself, and others.

// The free plans count the answer length you ask for against a tokens-per-minute cap, so ask for no more than
// the answer style needs.
const MAX_TOKENS = { brief: 900, balanced: 1600, thorough: 2600 };

async function failure(res, label) {
  let body = {};
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  const err = body.error ?? {};
  const retry = Number(res.headers.get('retry-after'));
  return new ProviderError(err.message || `${label} answered ${res.status}`, {
    status: res.status,
    retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : undefined,
    kind: err.code === 'tool_use_failed' ? 'tool_failed' : undefined,
  });
}

// Read an OpenAI-style server-sent-event stream, yielding each parsed JSON chunk (and { done: true } at [DONE]).
async function* sseChunks(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') {
        yield { done: true };
        return;
      }
      try {
        yield JSON.parse(data);
      } catch {
        /* ignore a broken line */
      }
    }
  }
}

// body(model, options) can add provider-specific request fields.
export function createOpenAiCompatProvider({ name, label, baseUrl, apiKey, fetchImpl = fetch, body = () => ({}) }) {
  const adapter = (model, options = {}) => ({
    wrapImage: ({ mimeType, data }) => ({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${data}` } }),
    assistantToolMessage: (text, calls) => ({
      role: 'assistant',
      content: text || null,
      tool_calls: calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.args || '{}' } })),
    }),
    toolMessage: (call, content) => ({ role: 'tool', tool_call_id: call.id, content }),

    async *stream({ messages, tools, forceTool, signal }) {
      const res = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          max_completion_tokens: MAX_TOKENS[options.deepExplain ? 'thorough' : options.style] ?? 1600,
          ...(tools ? { tools, tool_choice: toolChoiceFor(forceTool) } : {}),
          ...body(model, options),
        }),
        signal,
      });
      if (!res.ok) throw await failure(res, label);

      let finished = false;
      for await (const chunk of sseChunks(res)) {
        if (chunk.error) throw new ProviderError(chunk.error.message ?? `${label} error`, { status: chunk.error.code === 'rate_limit_exceeded' ? 429 : 500 });
        if (chunk.done || chunk.choices?.[0]?.finish_reason) finished = true;
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;
        yield {
          text: delta.content || undefined,
          toolCalls: delta.tool_calls?.map((t) => ({ index: t.index, id: t.id, name: t.function?.name, args: t.function?.arguments })),
        };
      }
      // A stream that stops without ever saying it finished was cut off: that is an error, not a short answer.
      if (!finished && !signal?.aborted) throw new ProviderError('The answer stopped arriving before it was finished.', { status: 502 });
    },
  });

  const check = createModelCheck({ url: `${baseUrl}/models`, headers: { authorization: `Bearer ${apiKey}` }, idsOf: (b) => (b.data ?? []).map((m) => m.id), fetchImpl });

  // One tiny real request: can this model answer right now? (A few tokens; used by the readiness check.)
  async function ping(model) {
    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with the single word OK.' }], max_completion_tokens: 64, ...body(model, {}) }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw await failure(res, label);
    const out = await res.json();
    if (!out.choices?.length) throw new ProviderError('The reply was empty.', { status: 502 });
  }

  return {
    name,
    configured: () => Boolean(apiKey),
    ping,
    check,
    run: (model, args, shared) => runToolLoop(adapter(model, args.options), args, shared),
  };
}
