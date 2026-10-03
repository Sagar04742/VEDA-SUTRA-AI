// DEV/TEST STAND-IN for Gemini and Mistral (enabled with AI_MOCK=1). It is NOT a language model.
// It implements the same SDK surface as the real clients, so the real streaming, history, tool-calling
// and title code paths run end to end without API keys. It uses simple regexes to decide which tool to call.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function abortError() {
  return Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
}

const textOf = (content) => content.parts.map((p) => p.text ?? '').join(' ').trim();

// Decide which tool a plain-text question needs.
function planCall(userText, contents) {
  const t = userText.replace(/,/g, '');
  let m;
  if ((m = t.match(/(\d+)\s*(?:x|×|\*|times)\s*(\d+)/i))) return { name: 'vedic_multiply', args: { a: m[1], b: m[2] } };
  if ((m = t.match(/square of (\d+)|(\d+)\s*(?:squared|\^2|²)/i))) return { name: 'vedic_square', args: { number: m[1] || m[2] } };
  if ((m = t.match(/vinculum.*?(\d+)/i))) return { name: 'vinculum_convert', args: { number: m[1] } };
  if ((m = t.match(/(\d+)\s+(?:is\s+)?divisible by\s+(\d+)|is\s+(\d+)\s+divisible by\s+(\d+)/i)))
    return { name: 'check_divisibility', args: { number: m[1] || m[3], divisor: Number(m[2] || m[4]) } };
  if ((m = t.match(/digit sum of (\d+)/i))) return { name: 'digit_sum', args: { number: m[1] } };

  // Knowledge question. A pronoun means "use the earlier topic from the history".
  let query = userText;
  if (/\b(it|its|this|that|they|them|those|these)\b/i.test(userText)) {
    const earlier = contents.slice(0, -1).filter((c) => c.role === 'user').map(textOf);
    if (earlier.length) query = `${earlier.at(-1)} ${userText}`;
  }
  return { name: 'searchKnowledge', args: { query } };
}

function compose(responses) {
  const out = ['_(Mock model: AI_MOCK is on, so this reply is assembled from tool output, not written by an AI.)_', ''];
  for (const { name, response } of responses) {
    if (response.error) out.push(`I could not do that: ${response.error}`);
    else if (name === 'searchKnowledge') {
      if (!response.results.length) out.push("I couldn't find that in my knowledge base, so I won't guess.");
      else {
        const [top, ...rest] = response.results;
        out.push(`**${top.name}**${top.sanskrit ? ` (${top.sanskrit})` : ''}`, '', top.meaning, '');
        out.push(`Source: ${top.source} (provenance: ${top.provenance})`);
        if (rest.length) out.push('', `Related: ${rest.map((r) => r.name).join('; ')}`);
      }
    } else {
      out.push(`**Answer: ${response.answer}** (${response.method}). The working is in the Steps panel above.`);
    }
    out.push('');
  }
  return out.join('\n').trim();
}

export function createMockGeminiClient({ delayMs = 6 } = {}) {
  return {
    models: {
      async generateContentStream({ contents, config }) {
        const signal = config?.abortSignal;
        const last = contents.at(-1);
        const responses = last.parts.filter((p) => p.functionResponse).map((p) => p.functionResponse);

        return (async function* () {
          if (signal?.aborted) throw abortError();
          const images = last.parts.filter((p) => p.inlineData).length;
          if (responses.length === 0) {
            const userText = textOf(last);
            const note = images ? `_(Mock model: I can see ${images} attached image${images > 1 ? 's' : ''}, but a real model is needed to read them.)_` : '';
            if (images && !userText) {
              yield { candidates: [{ content: { parts: [{ text: note }] } }] };
              return;
            }
            if (note) yield { candidates: [{ content: { parts: [{ text: note }] } }] };
            yield { candidates: [{ content: { parts: [{ functionCall: planCall(userText, contents) }] } }] };
            return;
          }
          // Stream the composed answer a few characters at a time.
          const text = compose(responses);
          const searching = config?.tools?.some((t) => t.googleSearch);
          for (let i = 0; i < text.length; i += 10) {
            if (signal?.aborted) throw abortError();
            await sleep(delayMs);
            yield {
              candidates: [
                {
                  content: { parts: [{ text: text.slice(i, i + 10) }] },
                  // With Web search on, pretend Google Search grounded the answer.
                  ...(searching && i === 0 ? { groundingMetadata: { groundingChunks: [{ web: { uri: 'https://example.com/mock-source', title: 'Example web source (mock)' } }] } } : {}),
                },
              ],
            };
          }
        })();
      },
    },
  };
}

export function createMockMistralClient() {
  return {
    chat: {
      async complete({ messages }) {
        const first = messages.at(-1).content.replace(/^First message of the chat:\n/, '');
        const title = first.split(/\s+/).slice(0, 4).join(' ');
        return { choices: [{ message: { content: title } }] };
      },
    },
  };
}
