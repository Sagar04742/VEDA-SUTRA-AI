import { describe, it, expect, vi } from 'vitest';
import { createGeminiService, describeAiError } from '../services/gemini.js';
import { SYSTEM_PROMPT } from '../services/prompt.js';
import { buildConversation, mergeTurns } from '../utils/history.js';

// A fake @google/genai client. Each script entry is the list of stream chunks for one model call.
function fakeClient(script) {
  const requests = [];
  return {
    requests,
    models: {
      generateContentStream: async (req) => {
        requests.push(structuredClone({ ...req, config: { ...req.config, abortSignal: undefined } }));
        requests.at(-1).signal = req.config.abortSignal;
        const chunks = script[requests.length - 1] ?? script.at(-1);
        return (async function* () {
          for (const c of typeof chunks === 'function' ? chunks(req) : chunks) {
            if (c instanceof Error) throw c;
            yield { candidates: [{ content: { parts: [c] } }] };
          }
        })();
      },
    },
  };
}
const svc = (client) => createGeminiService({ model: 'test-model', client });
const msgs = (...pairs) => pairs.map(([role, content]) => ({ role, content }));

describe('gemini streaming', () => {
  it('streams tokens in order and sends system prompt, tools and history', async () => {
    const client = fakeClient([[{ text: 'Vedic ' }, { text: 'maths ' }, { text: 'is great.' }]]);
    const tokens = [];
    const out = await svc(client).streamChat({
      messages: msgs(['user', 'What is Vedic math?'], ['assistant', 'A system.'], ['user', 'What are the types of it?']),
      signal: new AbortController().signal,
      onToken: (t) => tokens.push(t),
    });

    expect(tokens).toEqual(['Vedic ', 'maths ', 'is great.']);
    expect(out).toMatchObject({ text: 'Vedic maths is great.', aborted: false, solver: [] });

    const req = client.requests[0];
    expect(req.model).toBe('test-model');
    expect(req.config.systemInstruction).toBe(SYSTEM_PROMPT);
    expect(req.config.tools[0].functionDeclarations.map((d) => d.name)).toContain('searchKnowledge');
    // history is sent with Gemini roles, including the earlier turns
    expect(req.contents.map((c) => [c.role, c.parts[0].text])).toEqual([
      ['user', 'What is Vedic math?'],
      ['model', 'A system.'],
      ['user', 'What are the types of it?'],
    ]);
  });

  it('runs solver tools in a loop, streams the final text, and reports steps', async () => {
    const client = fakeClient([
      [{ text: 'Let me work that out.' }, { functionCall: { name: 'vedic_multiply', args: { a: '98', b: '97' } } }],
      [{ text: '98 × 97 = 9506.' }],
    ]);
    const tokens = [];
    const solverEvents = [];
    const out = await svc(client).streamChat({
      messages: msgs(['user', 'Multiply 98 × 97']),
      signal: new AbortController().signal,
      onToken: (t) => tokens.push(t),
      onSolver: (s) => solverEvents.push(s),
    });

    expect(client.requests.length).toBe(2);
    // round 2 got the model's tool call and the tool's real result back
    const second = client.requests[1].contents;
    expect(second.at(-2)).toMatchObject({ role: 'model' });
    expect(second.at(-2).parts.some((p) => p.functionCall?.name === 'vedic_multiply')).toBe(true);
    const fr = second.at(-1).parts[0].functionResponse;
    expect(fr.name).toBe('vedic_multiply');
    expect(fr.response.answer).toBe('9506');
    expect(fr.response.steps.length).toBeGreaterThan(3);
    // system prompt is present on every round (never dropped)
    expect(client.requests.every((r) => r.config.systemInstruction === SYSTEM_PROMPT)).toBe(true);

    expect(solverEvents).toHaveLength(1);
    expect(solverEvents[0]).toMatchObject({ tool: 'vedic_multiply', answer: '9506', method: 'nikhilam' });
    expect(out.solver).toHaveLength(1);
    expect(out.text).toBe('Let me work that out.\n\n98 × 97 = 9506.'); // rounds are separated
    expect(tokens.join('')).toBe(out.text);
  });

  it('passes tool errors back to the model instead of crashing', async () => {
    const client = fakeClient([
      [{ functionCall: { name: 'vedic_multiply', args: { a: 'abc', b: '5' } } }],
      [{ text: 'Please give me whole numbers.' }],
    ]);
    const out = await svc(client).streamChat({ messages: msgs(['user', 'multiply abc by 5']), signal: new AbortController().signal });
    expect(client.requests[1].contents.at(-1).parts[0].functionResponse.response.error).toMatch(/whole number/);
    expect(out.text).toBe('Please give me whole numbers.');
    expect(out.solver).toEqual([]); // failed calls are not shown as solved steps
  });

  it('stops looping after the maximum tool rounds and forces a text answer', async () => {
    const forever = [{ functionCall: { name: 'digit_sum', args: { number: '123' } } }];
    const client = fakeClient([forever, forever, forever, forever, forever, [{ text: 'done' }]]);
    const out = await svc(client).streamChat({ messages: msgs(['user', 'loop']), signal: new AbortController().signal });
    expect(client.requests.length).toBe(6);
    expect(client.requests.at(-1).config.tools).toBeUndefined(); // last round has no tools
    expect(out.text).toBe('done');
  });

  it('returns the partial text when aborted mid-stream', async () => {
    const ac = new AbortController();
    const client = fakeClient([
      () => [{ text: 'one ' }, { text: 'two ' }, new Error('never reached after abort')],
    ]);
    const tokens = [];
    const out = await svc(client).streamChat({
      messages: msgs(['user', 'go']),
      signal: ac.signal,
      onToken: (t) => {
        tokens.push(t);
        if (tokens.length === 2) ac.abort();
      },
    });
    expect(out.aborted).toBe(true);
    expect(out.text).toBe('one two ');
  });

  it('propagates real API errors', async () => {
    const client = fakeClient([[Object.assign(new Error('quota'), { status: 429 })]]);
    await expect(svc(client).streamChat({ messages: msgs(['user', 'hi']), signal: new AbortController().signal })).rejects.toThrow('quota');
  });

  it('ignores thought summaries and never shows them', async () => {
    const client = fakeClient([[{ text: 'secret reasoning', thought: true }, { text: 'Answer.' }]]);
    const tokens = [];
    await svc(client).streamChat({ messages: msgs(['user', 'hi']), signal: new AbortController().signal, onToken: (t) => tokens.push(t) });
    expect(tokens).toEqual(['Answer.']);
  });
});

describe('gemini configuration and errors', () => {
  it('reports what is missing without calling the API', () => {
    expect(createGeminiService({}).configError()).toMatch(/GEMINI_API_KEY/);
    expect(createGeminiService({ apiKey: 'k' }).configError()).toMatch(/GEMINI_MODEL/);
    expect(createGeminiService({ apiKey: 'k', model: 'm' }).configError()).toBeNull();
  });

  it('maps API errors to safe messages', () => {
    expect(describeAiError({ status: 429 }).message).toMatch(/limit|busy/i);
    expect(describeAiError({ status: 403 }).message).toMatch(/API key/);
    expect(describeAiError({ status: 404 }).message).toMatch(/GEMINI_MODEL/);
    expect(describeAiError(new Error('internal stack details')).message).not.toMatch(/internal/);
  });
});

describe('history builder', () => {
  it('keeps the last N, drops a leading assistant turn, merges same-role turns', () => {
    const prior = msgs(['user', 'a'], ['assistant', 'b'], ['user', 'c'], ['assistant', 'd'], ['user', 'e']);
    expect(buildConversation(prior, 'f', 3).map((m) => m.content)).toEqual(['c', 'd', 'e\n\nf']);
    expect(buildConversation(prior, 'f', 4).map((m) => m.content)).toEqual(['c', 'd', 'e\n\nf']); // 'b' starts the cut -> dropped
    expect(buildConversation([], 'hi', 20)).toEqual([{ role: 'user', content: 'hi' }]);
    expect(buildConversation(msgs(['user', ''], ['assistant', '  ']), 'hi')).toEqual([{ role: 'user', content: 'hi' }]);
    expect(mergeTurns(msgs(['user', 'x'], ['user', 'y']))).toEqual([{ role: 'user', content: 'x\n\ny' }]);
  });
});

describe('system prompt rules', () => {
  it('contains every rule required by the brief', () => {
    for (const phrase of ['searchKnowledge', 'verified_math', 'traditional_text', 'interpretation', 'not medical advice', 'off-topic', 'Cite the source', 'numbered', 'Never do the arithmetic yourself', 'honestly']) {
      expect(SYSTEM_PROMPT).toContain(phrase);
    }
  });
});

vi.setConfig({ testTimeout: 15000 });
