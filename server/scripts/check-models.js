// Does every model the app can use really work? One line per model.
//
//   npm run check:models -w server            asks each provider whether the key is accepted and the model exists
//                                            (free: no generation quota is used)
//   npm run check:models -w server -- --live  also sends each model a one-word message and times the answer
//                                            (uses a little quota; a rate-limited model is reported as "busy", not broken)
//
// This is also what the running server does at start-up and every ten minutes: a model that fails here is skipped
// everywhere and shown as "unavailable" in the Shastrarth contestant lists.
import { env } from '../config/env.js';
import { createAi } from '../services/ai.js';
import { describeAiError } from '../services/gemini.js';
import { createModelCheck } from '../services/providers/modelCheck.js';
import { isTransient } from '../utils/quota.js';

const live = process.argv.includes('--live');
const pad = (s, n) => String(s).padEnd(n);

async function ping(ai, entry) {
  const t0 = Date.now();
  try {
    const out = await Promise.race([
      ai.streamChat({ messages: [{ role: 'user', content: 'Namaste' }], options: { model: `${entry.provider}:${entry.model}` }, onToken() {} }),
      new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('no answer in 40 seconds'), { status: 504 })), 40000)),
    ]);
    return { ok: true, text: `answered in ${((Date.now() - t0) / 1000).toFixed(1)}s (${out.text.trim().split(/\s+/).length} words)` };
  } catch (err) {
    const d = describeAiError(err);
    if (d.code === 'rate_limit') return { ok: true, busy: true, text: `busy right now (free limit): ${d.message}` };
    if ([500, 502, 503].includes(err?.status ?? err?.statusCode) || isTransient(err)) return { ok: true, busy: true, text: 'temporarily failing on the provider\'s side (overloaded or a broken reply); the key and model are fine, and the app moves to the next model meanwhile' };
    return { ok: false, text: `FAILED (${err?.status ?? err?.statusCode ?? 'error'}): ${String(err?.message ?? err).replace(/\s+/g, ' ').slice(0, 110)}` };
  }
}

async function main() {
  const ai = createAi({ startHealthChecks: false });
  console.log(ai.configError() ?? 'Checking every model the app can use...\n');
  await ai.refreshHealth();

  let bad = 0;
  console.log(`${pad('Provider', 9)} ${pad('Model', 30)} ${pad('Used by', 28)} Result`);
  for (const m of ai.report()) {
    let result = m.ok === false ? `NOT USABLE: ${m.reason}` : m.unverified ? 'could not be verified (network or provider busy); assumed fine' : 'key accepted, model exists';
    if (m.ok === false) bad++;
    if (live && m.ok !== false) {
      const p = await ping(ai, m);
      result = p.text;
      if (!p.ok) bad++;
      await new Promise((r) => setTimeout(r, 1500));
    }
    console.log(`${pad(m.provider, 9)} ${pad(m.model, 30)} ${pad(m.levels.join(', ') || '(arena only)', 28)} ${result}`);
  }

  // Cohere writes the chat titles: not a contestant, but it must work too.
  if (env.cohere.apiKey) {
    const check = createModelCheck({ url: 'https://api.cohere.com/v1/models?page_size=200', headers: { authorization: `Bearer ${env.cohere.apiKey}` }, idsOf: (b) => (b.models ?? []).map((m) => m.name) });
    const r = await check(env.cohere.model);
    if (!r.ok) bad++;
    console.log(`${pad('cohere', 9)} ${pad(env.cohere.model, 30)} ${pad('chat titles', 28)} ${r.ok ? 'key accepted, model exists' : `NOT USABLE: ${r.reason}`}`);
  } else console.log(`${pad('cohere', 9)} (no COHERE_API_KEY: chat titles use the first 40 characters)`);

  console.log(bad ? `\n${bad} model(s) not usable. The app skips them automatically; fix the key or model name in server/.env to bring them back.` : '\nEvery model checked is usable.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
