// How good is the answer checker? Run it against the REAL knowledge base (no AI, no API quota used).
//
//   npm run calibrate -w server                 every knowledge-base entry + 300 random calculations
//   npm run calibrate -w server -- --limit 40   only the first 40 entries
//   npm run calibrate -w server -- --verbose    list every case the checker got wrong
//
// For each entry: a careful answer is written from the entry itself, then copies with ONE flaw each (no source,
// invented source, invented date, no facts, off the subject, overclaiming...). The checker must score the careful
// answer above every flawed copy by a safe margin, and the careful answer itself must score high.
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import Knowledge from '../models/Knowledge.js';
import { buildGroundTruth, scoreAnswer } from '../services/verifier.js';
import { calcBadAnswer, calcCases, calcGoodAnswer, flawedAnswers, goodAnswer, paraphrase, questionFor } from '../services/calibration.js';

const args = process.argv.slice(2);
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const verbose = args.includes('--verbose');

async function main() {
  await connectDB(env.mongoUri);
  // The hand-written library entries. Book chunks (kind "book") are raw page text, not entries with a question and an
  // answer, so they are left out unless --books is given.
  const includeBooks = args.includes('--books');
  const entries = (await Knowledge.find(includeBooks ? {} : { kind: { $ne: 'book' } }).lean()).slice(0, limit);
  console.log(`Calibrating the checker on ${entries.length} knowledge-base entries and 300 calculations...\n`);

  const stats = { entries: entries.length, retrieved: 0, goodScores: [], pairs: 0, ranked: 0, margins: {}, paraphrased: 0, paraphraseOk: 0 };
  const misses = [];
  for (const entry of entries) {
    const question = questionFor(entry);
    const truth = await buildGroundTruth(question);
    if (truth.evidence.some((e) => e.name === entry.name)) stats.retrieved++;
    const score = (text) => scoreAnswer(truth, { text, toolsUsed: ['searchKnowledge'] }, { style: 'balanced' }).score;
    const good = score(goodAnswer(entry));
    stats.goodScores.push(good);
    // Control: the same answer in other words must NOT be marked down (a checker that only likes exact copies is useless).
    const para = goodAnswer(entry) === paraphrase(goodAnswer(entry)) ? null : score(paraphrase(goodAnswer(entry)));
    if (para !== null) {
      stats.paraphrased++;
      if (good - para <= 1.0) stats.paraphraseOk++;
      else misses.push(`PARA ${(good - para).toFixed(1)} lost  paraphrase of "${entry.name.slice(0, 60)}" (good ${good.toFixed(1)}, paraphrased ${para.toFixed(1)})`);
    }
    if (good < 8) misses.push(`LOW  ${good.toFixed(1)}  good answer for "${entry.name.slice(0, 60)}" (${truth.kind}${truth.weak ? ', weak' : ''})`);
    for (const f of flawedAnswers(entry)) {
      const bad = score(f.text);
      stats.pairs++;
      const gap = good - bad;
      const m = (stats.margins[f.flaw] ??= { n: 0, ok: 0, sum: 0 });
      m.n++;
      m.sum += gap;
      if (gap >= f.minGap) {
        stats.ranked++;
        m.ok++;
      } else misses.push(`GAP  ${gap.toFixed(1)} < ${f.minGap}  "${f.flaw}" for "${entry.name.slice(0, 60)}" (good ${good.toFixed(1)}, flawed ${bad.toFixed(1)})`);
    }
  }

  // Calculations: the right product against off-by-a-little, off-by-tens and swapped-digit products.
  let calcPairs = 0;
  let calcOk = 0;
  for (const c of calcCases(300)) {
    const truth = await buildGroundTruth(c.question);
    const good = scoreAnswer(truth, calcGoodAnswer(c), { style: 'brief' }).score;
    for (const w of c.wrongs) {
      calcPairs++;
      const bad = scoreAnswer(truth, calcBadAnswer(c, w), { style: 'brief' }).score;
      if (good - bad >= 4) calcOk++;
      else misses.push(`CALC ${c.question}: right ${c.right} scored ${good}, wrong ${w} scored ${bad}`);
    }
  }

  const avg = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const pct = (n, d) => `${((100 * n) / (d || 1)).toFixed(1)}%`;
  console.log(`Knowledge base entries`);
  console.log(`  the entry is found as evidence for its own question: ${stats.retrieved}/${stats.entries} (${pct(stats.retrieved, stats.entries)})`);
  console.log(`  careful answers: mean score ${avg(stats.goodScores).toFixed(2)}, lowest ${Math.min(...stats.goodScores).toFixed(1)}, below 8: ${stats.goodScores.filter((s) => s < 8).length}`);
  console.log(`  careful answer beats its flawed copy by a safe margin: ${stats.ranked}/${stats.pairs} (${pct(stats.ranked, stats.pairs)})`);
  for (const [flaw, m] of Object.entries(stats.margins)) console.log(`    ${flaw.padEnd(34)} caught ${String(m.ok).padStart(3)}/${String(m.n).padEnd(3)} mean gap ${(m.sum / m.n).toFixed(2)}`);
  console.log(`  same answer in other words keeps its score (within 1 point): ${stats.paraphraseOk}/${stats.paraphrased} (${pct(stats.paraphraseOk, stats.paraphrased)})`);
  console.log(`Calculations: right beats wrong by 4+ points: ${calcOk}/${calcPairs} (${pct(calcOk, calcPairs)})`);

  const total = stats.pairs + calcPairs;
  const good = stats.ranked + calcOk;
  console.log(`\nOverall: ${good}/${total} correct rankings (${pct(good, total)})`);
  if (misses.length) {
    console.log(`\n${misses.length} cases the checker did not handle:`);
    for (const m of verbose ? misses : misses.slice(0, 15)) console.log('  ' + m);
    if (!verbose && misses.length > 15) console.log(`  ... (use --verbose for all ${misses.length})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
