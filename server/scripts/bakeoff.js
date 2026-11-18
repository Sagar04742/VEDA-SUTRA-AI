// Which model should answer for Plus / Pro / Lite? Ask the same questions to each candidate model and score every
// answer with the project's own deterministic checker (services/verifier.js). No AI judge, no guesswork.
//
//   npm run bakeoff -w server -- gemini:gemini-3.8-flash groq:openai/gpt-oss-120b mistral:ministral-14b-latest
//   npm run bakeoff -w server -- --style brief mistral:ministral-14b-latest      (answer length: brief | balanced | thorough)
//   npm run bakeoff -w server -- --limit 6 ...                                   (first N questions only)
//   npm run bakeoff -w server -- --out file.json ...                             (save every answer with its score notes)
//   npm run bakeoff -w server -- --pause 45 ...                                  (seconds between questions; free plans need this)
//
// Each model runs alone (no fallback), so a rate limit shows up as an error instead of being hidden.
// Models of different providers run at the same time; one model's questions run one after another.
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { createGeminiService } from '../services/gemini.js';
import { createGroqProvider } from '../services/providers/groq.js';
import { createMistralChatProvider } from '../services/providers/mistralChat.js';
import { createChain } from '../services/chain.js';
import { buildGroundTruth, scoreAnswer } from '../services/verifier.js';
import { parseSpec } from '../config/tiers.js';
import { describeAiError } from '../services/gemini.js';

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const style = opt('--style', 'balanced');
const limit = Number(opt('--limit', 0)) || Infinity;
const pause = Number(opt('--pause', 0)) * 1000;
const outFile = opt('--out', null);
const candidates = args.filter((a, i) => !a.startsWith('--') && !String(args[i - 1]).startsWith('--')).map(parseSpec).filter(Boolean);

const QUESTIONS = [
  'Multiply 98 × 97 using a Vedic technique',
  'What is the square of 95?',
  'Is 2184 divisible by 8?',
  'Multiply 1003 × 998',
  'What is the Nikhilam sutra and when do I use it?',
  'Tell me about the Delhi Iron Pillar',
  'What did Aryabhata contribute to astronomy?',
  'How were bhasmas prepared in Rasashastra?',
  'Did ancient India really have flying vimanas?',
  'What does the Vedic sutra say about quantum computers?',
  'Who won the football World Cup in 2022?',
  'वैदिक गणित में वर्ग करने की सबसे आसान विधि क्या है?',
].slice(0, limit);

// Gemini's free plan allows roughly 6 big-model calls a minute; keep clear of it.
const PAUSE_MS = { gemini: 14000, groq: 2500, mistral: 2500 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!candidates.length) throw new Error('Pass models as provider:model, for example groq:openai/gpt-oss-120b');
  await connectDB(env.mongoUri);
  const gemini = createGeminiService({ apiKey: env.gemini.apiKey, model: env.gemini.model });
  const chain = createChain({
    gemini: { name: 'gemini', configured: () => !gemini.configError(), run: (id, a, s) => gemini.runModel(id, a, s) },
    groq: createGroqProvider({ apiKey: env.groq.apiKey }),
    mistral: createMistralChatProvider({ apiKey: env.mistral.apiKey }),
  });

  console.log(`Building ground truth for ${QUESTIONS.length} questions...`);
  const truths = [];
  for (const q of QUESTIONS) truths.push(await buildGroundTruth(q));
  console.log(truths.map((t, i) => `  ${t.kind.padEnd(12)} ${QUESTIONS[i].slice(0, 60)}`).join('\n'), '\n');

  async function runCandidate(spec) {
    const rows = [];
    for (let i = 0; i < QUESTIONS.length; i++) {
      const t0 = Date.now();
      let row;
      try {
        const r = await chain.streamChat({ models: [spec], messages: [{ role: 'user', content: QUESTIONS[i] }], options: { style }, toolContext: {} });
        const s = scoreAnswer(truths[i], r);
        row = { text: r.text, notes: s.breakdown.flatMap((c) => c.notes.map((n) => `${c.key} ${n.ok ? 'ok ' : 'NO '} ${n.points}/${n.of} ${n.text}`)), score: s.score, parts: s.breakdown.map((c) => c.score), ms: Date.now() - t0, tools: r.toolsUsed.length, words: r.text.split(/\s+/).length };
      } catch (err) {
        row = { error: describeAiError(err).code, detail: String(err?.message ?? err).replace(/\s+/g, ' ').slice(0, 90), ms: Date.now() - t0 };
      }
      rows.push(row);
      process.stdout.write(`  ${spec.provider}:${spec.id} q${i + 1} ${row.error ? `ERROR ${row.error}` : row.score.toFixed(1)}\n`);
      await sleep(pause || PAUSE_MS[spec.provider] || 3000);
    }
    return { spec, rows };
  }

  const results = await Promise.all(candidates.map(runCandidate));

  console.log('\nQuestion kinds:', truths.map((t) => t.kind[0]).join(' '), '(c calculation, k knowledge, u unknown topic, o off-topic, u unchecked language)');
  console.log('\nmodel'.padEnd(46), 'mean', ' acc  grd  hon  clr', ' secs', 'words', 'errors');
  for (const { spec, rows } of results) {
    const ok = rows.filter((r) => !r.error);
    const avg = (f) => (ok.length ? ok.reduce((s, r) => s + f(r), 0) / ok.length : 0);
    const parts = [0, 1, 2, 3].map((i) => avg((r) => r.parts[i]).toFixed(1).padStart(4));
    console.log(`${(spec.provider + ':' + spec.id).padEnd(45)} ${avg((r) => r.score).toFixed(2).padStart(5)} ${parts.join(' ')} ${(avg((r) => r.ms) / 1000).toFixed(1).padStart(5)} ${avg((r) => r.words).toFixed(0).padStart(5)} ${rows.length - ok.length}`);
  }
  console.log('\nPer question (score):');
  for (const { spec, rows } of results) console.log(`  ${(spec.provider + ':' + spec.id).padEnd(44)} ${rows.map((r) => (r.error ? ' ERR' : r.score.toFixed(1).padStart(4))).join(' ')}`);
  const failures = results.flatMap(({ spec, rows }) => rows.filter((r) => r.error).map((r) => `${spec.id}: ${r.error} ${r.detail}`));
  if (failures.length) console.log('\nErrors:\n  ' + [...new Set(failures)].join('\n  '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
