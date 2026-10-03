// Ask the question bank (data/raw/questions_extended.csv) through the REAL app and write a review report.
//
//   npm run eval -w server                       all 39 knowledge questions
//   npm run eval -w server -- --category traps   only: sutras | science | traps | calc
//   npm run eval -w server -- --limit 10         first N questions
//   npm run eval -w server -- --calc             also ask the 47 exact calculations
//
// Each question gets a brand-new chat (so no memory leaks between questions). Scoring is a quick keyword check
// against the reference answer, not a judge model (that would use up your free quota): treat it as a triage list and
// read the report at data/processed/eval-report.md. Note: the knowledge-type answers of this file were also loaded
// into the knowledge base, so a high score here shows the pipeline works, not that the bot generalises.
import { readFileSync, writeFileSync } from 'node:fs';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import { createApp } from '../src/app.js';
import { createAi } from '../services/ai.js';
import User from '../models/User.js';
import Chat from '../models/Chat.js';
import { parseCsv } from '../../data/ingest.js';

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const category = opt('--category');
const limit = Number(opt('--limit')) || Infinity;
const withCalc = args.includes('--calc');

const CATS = { sutras: 'Sutra Identification', science: 'Ancient Science', traps: 'Hallucination Trap', calc: 'Calculation' };
const STOP = new Set('about after also and are because between but can for from has have into its not one only that the their them then there these they this those used using was were what when where which who why will with within your'.split(' '));
const keywords = (text) => [...new Set((text.toLowerCase().match(/[a-z0-9][a-z0-9'’-]{3,}|\d+/g) ?? []).filter((w) => !STOP.has(w)))].slice(0, 10);
const NEGATION = /\b(no|not|never|myth|unsupported|overstated|disputed|incorrect|false|actually|rather than|however|trap|unclear|no evidence)\b/i;

async function readSse(res) {
  const text = await res.text();
  return text.split('\n\n').map((b) => ({ event: b.match(/^event: (.*)$/m)?.[1], data: b.match(/^data: (.*)$/m)?.[1] })).filter((e) => e.event).map((e) => ({ event: e.event, data: JSON.parse(e.data) }));
}

async function main() {
  await connectDB(env.mongoUri);
  const ai = createAi();
  const problem = ai.configError();
  if (problem) throw new Error(problem);

  const [, ...rows] = parseCsv(readFileSync(new URL('../../data/raw/questions_extended.csv', import.meta.url), 'utf8'));
  let questions = rows
    .map((r) => ({ id: r[0], category: r[1], type: r[2], question: r[4], expected: r[5], source: r[6] }))
    .filter((q) => (category ? q.category === CATS[category] : true))
    .filter((q) => withCalc || category === 'calc' || !(q.category === 'Calculation' && q.type === 'exact'));
  questions = questions.slice(0, limit);
  console.log(`Asking ${questions.length} questions with ${env.gemini.model}${env.gemini.fallbackModel ? ` (fallback ${env.gemini.fallbackModel})` : ''}...\n`);

  const server = createApp({ ai }).listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const email = `eval-${Date.now()}@example.com`;
  const results = [];
  try {
    const signup = await fetch(`${base}/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Eval', email, password: 'eval-password-123' }) });
    const cookie = signup.headers.get('set-cookie').split(';')[0];
    const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: body && JSON.stringify(body) });

    for (const q of questions) {
      const { chat } = await (await post('/chats')).json();
      let events = [];
      let error = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await post(`/chats/${chat.id}/messages`, { content: q.question });
        if (!res.ok) { error = (await res.json()).error; events = []; break; }
        events = await readSse(res);
        const err = events.find((e) => e.event === 'error')?.data;
        error = err?.message ?? null;
        if (err?.code === 'rate_limit' && err.retryAfterSeconds && err.retryAfterSeconds <= 120 && attempt === 0) {
          process.stdout.write(`   (limit reached, waiting ${err.retryAfterSeconds}s) `);
          await new Promise((r) => setTimeout(r, (err.retryAfterSeconds + 2) * 1000));
          continue;
        }
        break;
      }
      const answer = events.filter((e) => e.event === 'token').map((e) => e.data.text).join('').trim();
      const solver = events.find((e) => e.event === 'solver')?.data;
      const kw = keywords(q.expected);
      const low = `${answer} ${solver?.answer ?? ''}`.toLowerCase();
      const hit = kw.filter((k) => low.includes(k.slice(0, Math.max(4, k.length - 2)))).length;
      const score = kw.length ? hit / kw.length : 0;
      const trapOk = q.category !== 'Hallucination Trap' || NEGATION.test(answer);
      const exactOk = q.type !== 'exact' || low.replace(/,/g, '').includes(q.expected.replace(/,/g, '').trim().toLowerCase());
      const verdict = error ? 'ERROR' : score >= 0.5 && trapOk && exactOk ? 'LIKELY OK' : 'REVIEW';
      results.push({ ...q, answer, error, solver: solver?.method, score, verdict, cites: /source|according to|provenance|traditional|interpretation|verified/i.test(answer) });
      console.log(`${verdict.padEnd(9)} ${q.id}  ${q.question.slice(0, 70)}${error ? `  [${error.slice(0, 60)}]` : ''}`);
    }
  } finally {
    const u = await User.findOne({ email });
    if (u) {
      await Chat.deleteMany({ userId: u._id });
      await User.deleteOne({ _id: u._id });
    }
    server.close();
    await mongoose.disconnect();
  }

  const count = (v) => results.filter((r) => r.verdict === v).length;
  const md = [
    `# Question-bank evaluation (${new Date().toISOString().slice(0, 16).replace('T', ' ')})`,
    `Model: ${env.gemini.model}${env.gemini.fallbackModel ? ` (fallback ${env.gemini.fallbackModel})` : ''}. ${results.length} questions: ${count('LIKELY OK')} likely OK, ${count('REVIEW')} to review, ${count('ERROR')} errors.`,
    '',
    'Scoring is a keyword check against the reference answer, not a judge model. Read the REVIEW rows yourself.',
    '',
    ...results.flatMap((r) => [
      `## ${r.id} [${r.verdict}] ${r.category} (${r.type}, ${r.score.toFixed(2)})`,
      `**Q:** ${r.question}`,
      `**Reference:** ${r.expected}  _(${r.source})_`,
      `**Answer:** ${r.error ? `ERROR: ${r.error}` : r.answer.replace(/\n+/g, '\n> ').replace(/^/, '> ')}${r.solver ? `\n_Solver used: ${r.solver}_` : ''}`,
      '',
    ]),
  ].join('\n');
  writeFileSync(new URL('../../data/processed/eval-report.md', import.meta.url), md);
  console.log(`\n${count('LIKELY OK')} likely OK, ${count('REVIEW')} to review, ${count('ERROR')} errors. Report: data/processed/eval-report.md`);
}

main().then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); });
