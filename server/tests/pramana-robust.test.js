import { describe, it, expect } from 'vitest';
import { buildGroundTruth, clearTruthCache, scoreAnswer, MAX_ANALYSED_CHARS } from '../services/verifier.js';
import { toEnglishQuery } from '../services/glossary.js';
import { goodAnswer, questionFor } from '../services/calibration.js';
import './helpers.js';

const ENTRIES = [
  {
    name: 'Delhi Iron Pillar', sanskrit: '', tags: ['iron', 'pillar', 'delhi', 'metallurgy'], category: 'metallurgy', source: 'Archaeological Survey of India notes', provenance: 'interpretation',
    meaning: 'The Iron Pillar of Delhi was erected in the 4th century CE. It has resisted corrosion for more than 1600 years. Metallurgists link this to its phosphorus-rich wrought iron and a thin protective film.',
    whenToUse: '', steps: [], examples: [],
  },
  {
    name: 'Aryabhata', sanskrit: 'आर्यभट', tags: ['aryabhata', 'astronomy', 'mathematics'], category: 'astronomy', source: 'Aryabhatiya, translated by Clark', provenance: 'traditional_text',
    meaning: 'Aryabhata composed the Aryabhatiya in 499 CE. The text gives an approximation of pi as 3.1416 and states that the Earth rotates on its axis.',
    whenToUse: '', steps: [], examples: [],
  },
  {
    name: 'Nikhilam Navatashcaramam Dashatah', sanskrit: 'निखिलं नवतश्चरमं दशतः', tags: ['nikhilam', 'sutra', 'multiplication', 'base'], category: 'sutra', source: 'Vedic Mathematics by Bharati Krishna Tirthaji', provenance: 'verified_math',
    meaning: 'All from nine and the last from ten. A way to multiply numbers near a power of ten by working with their deficits from the base.',
    whenToUse: '', steps: [], examples: [],
  },
];
const sources = ENTRIES.map((e) => e.source);
const searchOver = async (q) => ENTRIES.filter((e) => q.toLowerCase().split(/\W+/).some((w) => w.length > 3 && `${e.name} ${e.tags.join(' ')}`.toLowerCase().includes(w)));
const truthFor = (entry, question = questionFor(entry)) => buildGroundTruth(question, { search: searchOver, sources });
const scoreOf = (truth, text, extra = {}) => scoreAnswer(truth, { text, toolsUsed: ['searchKnowledge'], ...extra }, { style: 'balanced' });

describe('Hindi questions are checked through the glossary', () => {
  it('maps this project’s Hindi vocabulary to English', () => {
    expect(toEnglishQuery('दिल्ली का लौह स्तंभ क्या है?')).toBe('delhi iron pillar');
    expect(toEnglishQuery('वैदिक गणित में वर्ग करने की विधि')).toBe('vedic mathematics square method');
    expect(toEnglishQuery('What is नक्षत्र 27')).toBe('What is nakshatra 27');
    expect(toEnglishQuery('क्या है?')).toBe('');
  });

  it('finds the entry for a Hindi question and compares figures, dates and sources (not the wording)', async () => {
    const truth = await truthFor(ENTRIES[0], 'दिल्ली का लौह स्तंभ क्या है?');
    expect(truth.kind).toBe('knowledge');
    expect(truth.xlang).toBe(true);
    const right = 'दिल्ली का लौह स्तंभ चौथी शताब्दी का है और 1600 वर्ष से अधिक समय से जंग का सामना कर रहा है।\n\nस्रोत: Archaeological Survey of India notes (interpretation).';
    const wrongFigure = right.replace('1600', '2500');
    const inventedSource = right.replace('Archaeological Survey of India notes', 'Brihad Zyxqwv Samhita');
    const a = scoreOf(truth, right);
    const b = scoreOf(truth, wrongFigure);
    const c = scoreOf(truth, inventedSource);
    expect(a.evidence.confidence).toBe('limited');
    expect(a.breakdown[0].score).toBe(2.5); // facts: neutral
    expect(a.score).toBeLessThanOrEqual(9);
    expect(a.score).toBeGreaterThanOrEqual(8);
    expect(a.score - b.score).toBeGreaterThanOrEqual(1.5); // a changed figure is caught even in Hindi
    expect(a.score - c.score).toBeGreaterThanOrEqual(1.5); // so is an invented source
    expect(b.risk.level).not.toBe('low');
  });

  it('still says "unchecked" when the glossary cannot place the question', async () => {
    const truth = await buildGroundTruth('यह क्या बात है?', { search: searchOver, sources });
    expect(truth.kind).toBe('unchecked');
    expect(scoreOf(truth, 'यह एक सामान्य उत्तर है।').evidence.confidence).toBe('limited');
  });
});

describe('verdicts say how far to trust them', () => {
  it('exact for a calculation, high or medium for the knowledge base, rules for the rest', async () => {
    expect(scoreOf(await buildGroundTruth('Multiply 98 × 97'), 'The answer is 9506.', { toolsUsed: ['vedic_multiply'] }).evidence.confidence).toBe('exact');
    expect(scoreOf(await truthFor(ENTRIES[0]), goodAnswer(ENTRIES[0])).evidence.confidence).toBe('high');
    expect(scoreOf(await buildGroundTruth('Namaste!'), 'Namaste! How can I help?').evidence.confidence).toBe('rules');
  });
});

describe('the ground truth is remembered, not recomputed', () => {
  it('returns the same object for the same question until the cache is cleared', async () => {
    clearTruthCache();
    const first = await buildGroundTruth('Multiply 12 × 13 please');
    expect(await buildGroundTruth('Multiply 12 × 13 please')).toBe(first);
    clearTruthCache();
    expect(await buildGroundTruth('Multiply 12 × 13 please')).not.toBe(first);
  });
});

describe('hostile and strange input cannot hang or break the checker', () => {
  const truthPromise = truthFor(ENTRIES[0]);
  const timed = async (text) => {
    const truth = await truthPromise;
    const t0 = performance.now();
    const r = scoreOf(truth, text);
    return { r, ms: performance.now() - t0 };
  };

  it('stays fast on pathological text', async () => {
    const nasty = [
      ' '.repeat(100000) + '1 + 1 = 2',
      '1 '.repeat(30000),
      '1+1='.repeat(8000),
      '9'.repeat(100000),
      'a. '.repeat(30000),
      '='.repeat(50000),
      ('98 × 97 = 9506 ').repeat(4000),
      'Source: ' + 'x'.repeat(50000),
      'क'.repeat(60000),
    ];
    for (const text of nasty) {
      const { r, ms } = await timed(text);
      expect(ms).toBeLessThan(1500);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(10);
    }
  }, 60000);

  it('never throws on odd values, and the score is always between 0 and 10', async () => {
    const truth = await truthPromise;
    for (const odd of [undefined, null, '', ' ', 0, 42, {}, [], 'ok\u0000ok', '‮evil', '😀😀😀', '\n\n\n', 'Source:', '= = =', '(((', '$$$', '\\frac{1}{2}']) {
      const r = scoreAnswer(truth, { text: odd, toolsUsed: undefined, solver: null }, {});
      expect(Number.isFinite(r.score)).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(10);
    }
    expect(Number.isFinite(scoreAnswer(truth, undefined).score)).toBe(true);
  });

  it('only the first part of a huge answer is analysed, and that is said', async () => {
    const { r } = await timed(`${goodAnswer(ENTRIES[0])}\n\n${'Filler sentence about the pillar. '.repeat(2000)}`);
    expect(r.breakdown[3].notes.some((n) => new RegExp(`Over ${MAX_ANALYSED_CHARS}`).test(n.text))).toBe(true);
  });
});

// Metamorphic properties: changes that can only make an answer worse must never raise its score.
describe('properties that must always hold', () => {
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const shuffled = (list) => list.map((v) => [rand(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);

  for (const entry of ENTRIES) {
    it(`${entry.name}: damage never helps, and chatter or reordering changes nothing it should not`, async () => {
      const truth = await truthFor(entry);
      const good = goodAnswer(entry);
      const base = scoreOf(truth, good);
      expect(scoreOf(truth, good).score).toBe(base.score); // deterministic

      // damage never raises the score
      const damaged = [
        `${good}\n\nIt was composed in 1337 CE by a famous scholar.`,
        good.replace(/\n\nSource:[^\n]*/, ''),
        `${good}\n\nAlso 12 × 12 = 150.`,
        `${good}\n\nThis is proven beyond doubt and a lost advanced technology.`,
        good.replace(/Source:[^\n]*/, 'Source: Brihad Zyxqwv Samhita, chapter 14.'),
      ];
      for (const text of damaged) expect(scoreOf(truth, text).score).toBeLessThanOrEqual(base.score);

      // friendly closing questions are not judged: facts and honesty are untouched
      const chatty = scoreOf(truth, `${good}\n\nWould you like to hear more about this?`);
      expect(chatty.breakdown[0].score).toBe(base.breakdown[0].score);
      expect(chatty.breakdown[2].score).toBe(base.breakdown[2].score);

      // the order of the body sentences does not change the facts score
      const [body, ...rest] = good.split('\n\n');
      const sentences = body.split(/(?<=[.!?])\s+/);
      for (let i = 0; i < 3; i++) {
        const re = [shuffled(sentences).join(' '), ...rest].join('\n\n');
        expect(scoreOf(truth, re).breakdown[0].score).toBe(base.breakdown[0].score);
      }
    });
  }

  it('every score on random mixtures of good and bad parts stays inside 0..10', async () => {
    const truth = await truthFor(ENTRIES[1]);
    const parts = [goodAnswer(ENTRIES[1]), 'In 1200 CE it was written.', 'Source: Made Up Book.', '2 + 2 = 5.', 'Namaste!', 'This is a miracle.', 'It is said in the texts.', '', '😀'];
    for (let i = 0; i < 300; i++) {
      const text = shuffled(parts).slice(0, 1 + Math.floor(rand() * parts.length)).join(' ');
      const r = scoreOf(truth, text);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(10);
      expect(r.breakdown.reduce((s, c) => s + c.score, 0)).toBeCloseTo(r.score, 0);
    }
  });
});
