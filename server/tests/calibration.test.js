import { describe, it, expect } from 'vitest';
import { buildGroundTruth, checkArithmetic, scoreAnswer, LENGTH_BUDGET } from '../services/verifier.js';
import { calcBadAnswer, calcCases, calcGoodAnswer, flawedAnswers, goodAnswer, questionFor } from '../services/calibration.js';
import './helpers.js';

// A small made-up knowledge base: the checker must rank a careful answer above each flawed copy of it.
const ENTRIES = [
  {
    name: 'Delhi Iron Pillar',
    sanskrit: '',
    meaning: 'The Iron Pillar of Delhi was erected around 400 CE and has resisted corrosion for more than 1600 years. Metallurgists link this to its phosphorus-rich wrought iron and a thin protective film.',
    whenToUse: '', steps: [], examples: [], tags: ['iron', 'pillar', 'delhi', 'metallurgy'], category: 'metallurgy',
    source: 'Archaeological Survey of India notes', provenance: 'interpretation',
  },
  {
    name: 'Rasashastra bhasma preparation',
    sanskrit: 'रसशास्त्र',
    meaning: 'Rasashastra describes the calcination of metals into bhasma using herbal juices and repeated heating, as recorded in medieval Ayurvedic treatises.',
    whenToUse: '', steps: [], examples: [], tags: ['bhasma', 'rasashastra', 'ayurveda'], category: 'medicine',
    source: 'Rasa Ratna Samuccaya', provenance: 'traditional_text',
  },
  {
    name: 'Nikhilam Navatashcaramam Dashatah',
    sanskrit: 'निखिलं नवतश्चरमं दशतः',
    meaning: 'All from nine and the last from ten. A way to multiply numbers near a power of ten by working with their deficits from the base.',
    whenToUse: '', steps: [], examples: [], tags: ['nikhilam', 'sutra', 'multiplication', 'base'], category: 'sutra',
    source: 'Vedic Mathematics by Bharati Krishna Tirthaji', provenance: 'verified_math',
  },
];
const sourcesOf = ENTRIES.map((e) => e.source);
const searchOver = async (q) => ENTRIES.filter((e) => q.toLowerCase().split(/\W+/).some((w) => w.length > 3 && `${e.name} ${e.tags.join(' ')}`.toLowerCase().includes(w)));

describe('the checker can tell a careful answer from a flawed copy of it', () => {
  for (const entry of ENTRIES) {
    it(`${entry.name}: every flaw scores lower than the careful answer`, async () => {
      const truth = await buildGroundTruth(questionFor(entry), { search: searchOver, sources: sourcesOf });
      expect(truth.kind).toBe('knowledge');
      const score = (text) => scoreAnswer(truth, { text, toolsUsed: ['searchKnowledge'] }, { style: 'balanced' }).score;
      const good = score(goodAnswer(entry));
      expect(good).toBeGreaterThanOrEqual(9);
      for (const f of flawedAnswers(entry)) {
        expect(good - score(f.text), `flaw: ${f.flaw}`).toBeGreaterThanOrEqual(f.minGap);
      }
    });
  }
});

describe('calculations: 300 random products, right vs wrong', () => {
  it('the right product always scores at least 4 points above a wrong one', async () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); // repeatable
    for (const c of calcCases(300, rand)) {
      const truth = await buildGroundTruth(c.question);
      const good = scoreAnswer(truth, calcGoodAnswer(c), { style: 'brief' }).score;
      expect(good).toBe(10);
      for (const w of c.wrongs) expect(good - scoreAnswer(truth, calcBadAnswer(c, w), { style: 'brief' }).score, `${c.question}: ${w}`).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('working steps are not mistaken for a wrong final answer', () => {
  it('does not flag intermediate results such as 95 × 100 = 9500', async () => {
    const truth = await buildGroundTruth('Multiply 98 × 97 using a Vedic technique');
    const solver = [{ tool: 'vedic_multiply', answer: '9506' }];
    const steps = 'Using Nikhilam, 95 × 100 = 9500, then add 6 (that is 2 × 3) to get 9506. The answer is 9506.';
    const r = scoreAnswer(truth, { text: steps, toolsUsed: ['vedic_multiply'], solver }, { style: 'brief' });
    expect(r.breakdown[0].score).toBe(4);
    expect(r.breakdown[2].score).toBe(2);
    // ...but a wrong final answer is still caught, and so is wrong working
    expect(scoreAnswer(truth, { text: 'Nikhilam gives 95 | 06. The answer is 9500.', toolsUsed: ['vedic_multiply'], solver }, { style: 'brief' }).breakdown[0].score).toBe(0);
    expect(scoreAnswer(truth, { text: 'Nikhilam: 95 × 100 = 9600, so the answer is 9506.', toolsUsed: ['vedic_multiply'], solver }, { style: 'brief' }).breakdown[0].score).toBe(3);
  });
});

describe('arithmetic written inside an answer is verified exactly', () => {
  it('accepts correct sums and flags wrong ones', () => {
    expect(checkArithmetic('98 × 97 = 9506, and 100 − 2 = 98, so 12 + 30 = 42.')).toEqual({ checked: 3, wrong: [] });
    const r = checkArithmetic('96 × 93 = 8929 but 7 x 8 = 56 and 25² = 625; also 3 + 4 = 8.');
    expect(r.checked).toBe(4);
    expect(r.wrong).toEqual(['96 × 93 = 8929 (it is 8928)', '3 + 4 = 8 (it is 7)']);
  });

  it('copes with commas, squares, exact division and chains', () => {
    expect(checkArithmetic('1,003 × 998 = 1,000,994').wrong).toEqual([]);
    expect(checkArithmetic('95² = 9026').wrong).toEqual(['95² = 9026 (it is 9025)']);
    expect(checkArithmetic('144 ÷ 12 = 12').wrong).toEqual([]);
    expect(checkArithmetic('145 ÷ 12 = 12 remainder 1').checked).toBe(0); // not an exact division: nothing to check
    expect(checkArithmetic('2 × 3 × 4 = 24').checked).toBe(0); // chains are not split into false pairs
    expect(checkArithmetic('In 1947 India became free; 3.5 = 3.5').checked).toBe(0);
  });

  it('a wrong sum anywhere in a knowledge answer costs accuracy', async () => {
    const entry = ENTRIES[2];
    const truth = await buildGroundTruth(questionFor(entry), { search: searchOver, sources: sourcesOf });
    const base = goodAnswer(entry);
    const clean = scoreAnswer(truth, { text: `${base}\n\nExample: 96 × 93 = 8928.`, toolsUsed: ['searchKnowledge'] }, { style: 'balanced' });
    const wrong = scoreAnswer(truth, { text: `${base}\n\nExample: 96 × 93 = 8929.`, toolsUsed: ['searchKnowledge'] }, { style: 'balanced' });
    expect(clean.score - wrong.score).toBeGreaterThanOrEqual(1);
    expect(wrong.breakdown[0].notes.some((n) => /Arithmetic written in the answer is wrong/.test(n.text))).toBe(true);
  });
});

describe('level length, invented sources and loose matches', () => {
  it('holds each answer to the length its level promised', async () => {
    const truth = await buildGroundTruth('Tell me about the Delhi Iron Pillar', { search: searchOver, sources: sourcesOf });
    const short = goodAnswer(ENTRIES[0]);
    const long = `${short}\n\n${'The pillar stands in the Qutb complex and visitors admire it. '.repeat(60)}`;
    expect(LENGTH_BUDGET.brief).toBeLessThan(LENGTH_BUDGET.balanced);
    const a = scoreAnswer(truth, { text: short, toolsUsed: ['searchKnowledge'] }, { style: 'brief' });
    const b = scoreAnswer(truth, { text: long, toolsUsed: ['searchKnowledge'] }, { style: 'brief' });
    expect(a.breakdown[3].score).toBe(1);
    expect(b.breakdown[3].score).toBeCloseTo(0.8, 5);
    expect(b.breakdown[3].notes.some((n) => /Too long for its level/.test(n.text))).toBe(true);
    // the same long answer is fine when the level is Pro
    expect(scoreAnswer(truth, { text: long, toolsUsed: ['searchKnowledge'] }, { style: 'thorough' }).breakdown[3].score).toBe(1);
  });

  it('spots a source that is nowhere in the knowledge base, but accepts a short real one', async () => {
    const truth = await buildGroundTruth('Tell me about the Delhi Iron Pillar', { search: searchOver, sources: sourcesOf });
    const body = 'The Delhi Iron Pillar was erected around 400 CE and has resisted corrosion for more than 1600 years because of its phosphorus-rich wrought iron.';
    const real = scoreAnswer(truth, { text: `${body}\n\nSource: Archaeological Survey of India notes.`, toolsUsed: ['searchKnowledge'] });
    const shortReal = scoreAnswer(truth, { text: `${body}\n\nSource: Archaeological Survey of India.`, toolsUsed: ['searchKnowledge'] });
    const fake = scoreAnswer(truth, { text: `${body}\n\nSource: Brihad Zyxqwv Samhita, chapter 14.`, toolsUsed: ['searchKnowledge'] });
    expect(real.breakdown[1].score).toBe(3);
    expect(shortReal.breakdown[1].score).toBe(3);
    expect(fake.breakdown[1].score).toBe(1.5);
    expect(fake.breakdown[1].notes.some((n) => /looks invented/.test(n.text))).toBe(true);
  });

  it('veda finds Vedic, but a loose match does not mark down a careful general answer', async () => {
    const vedic = { ...ENTRIES[2], name: 'Vedic Mathematics (overview)', tags: ['vedic', 'mathematics'], meaning: 'Vedic Mathematics is a system of calculation techniques compiled by Bharati Krishna Tirthaji and published in 1965.', provenance: 'interpretation', source: 'Vedic Mathematics by Bharati Krishna Tirthaji' };
    const truth = await buildGroundTruth('what is veda?', { search: async () => [vedic], sources: [vedic.source] });
    expect(truth.kind).toBe('knowledge');
    expect(truth.weak).toBe(true);
    const general = 'The Vedas are the oldest scriptures of India, composed in Sanskrit and handed down orally, and they include the Rigveda, Samaveda, Yajurveda and Atharvaveda.';
    const r = scoreAnswer(truth, { text: general, toolsUsed: ['searchKnowledge'] }, { style: 'balanced' });
    expect(r.breakdown[0].score).toBeGreaterThanOrEqual(2.5);
    const offTopic = scoreAnswer(truth, { text: 'Paris is the capital of France and has many museums.', toolsUsed: [] }, { style: 'balanced' });
    expect(offTopic.breakdown[0].score).toBe(0);
  });
});
