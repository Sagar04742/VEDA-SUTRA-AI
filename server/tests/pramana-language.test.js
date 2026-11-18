import { describe, it, expect } from 'vitest';
import { buildGroundTruth, scoreAnswer } from '../services/verifier.js';
import { negatedStems } from '../services/claims.js';
import { paraphrase, goodAnswer } from '../services/calibration.js';
import { stem } from '../services/textutil.js';
import './helpers.js';

const pillar = {
  name: 'Delhi Iron Pillar', sanskrit: '', tags: ['iron', 'pillar', 'delhi', 'metallurgy'], category: 'metallurgy',
  source: 'Archaeological Survey of India notes', provenance: 'interpretation',
  meaning: 'The Iron Pillar of Delhi was erected in the 4th century CE. It has resisted corrosion for more than 1600 years. Metallurgists link this to its phosphorus-rich wrought iron. Modern studies avoid unexplained-miracle claims.',
  whenToUse: '', steps: [], examples: [],
};
const calculus = {
  name: 'Kerala School', sanskrit: '', tags: ['kerala', 'school', 'calculus', 'madhava'], category: 'mathematics',
  source: 'Plofker 2009', provenance: 'traditional_text',
  meaning: 'Madhava and his successors developed infinite series. There was no general theory of differentiation and integration.',
  whenToUse: '', steps: [], examples: [],
};
const truthOf = (entry, question) => buildGroundTruth(question, { search: async () => [entry], sources: [entry.source] });
const score = (truth, text) => scoreAnswer(truth, { text, toolsUsed: ['searchKnowledge'] }, { style: 'balanced' });
const statuses = (r) => r.claims.filter((c) => c.status !== 'meta').map((c) => c.status);

describe('word families: the same idea in other words is not marked down', () => {
  it('maps synonyms to one stem', () => {
    expect(stem('built')).toBe(stem('erected'));
    expect(stem('withstood')).toBe(stem('resisted'));
    expect(stem('rust')).toBe(stem('corrosion'));
    expect(stem('scholars')).toBe(stem('historian'));
    expect(stem('nikhilam')).not.toBe(stem('urdhva'));
  });

  it('an answer in other words still matches the knowledge base and keeps its score', async () => {
    const truth = await truthOf(pillar, 'What is the Delhi Iron Pillar?');
    const original = 'The Delhi Iron Pillar was erected in the 4th century CE and has resisted corrosion for more than 1600 years because of its phosphorus-rich wrought iron.\n\nSource: Archaeological Survey of India notes (interpretation).';
    const reworded = 'The Delhi Iron Pillar was built in the 4th century CE and has withstood rust for more than 1600 years because of its phosphorus-rich wrought iron.\n\nSource: Archaeological Survey of India notes (interpretation).';
    const a = score(truth, original);
    const b = score(truth, reworded);
    expect(b.breakdown[0].score).toBe(a.breakdown[0].score);
    expect(statuses(b)).toEqual(['supported']);
    expect(paraphrase(goodAnswer(pillar))).not.toBe(goodAnswer(pillar));
    expect(score(truth, paraphrase(goodAnswer(pillar))).score).toBeGreaterThanOrEqual(score(truth, goodAnswer(pillar)).score - 1);
  });
});

describe('negation: what is denied matters, not that a "not" appears', () => {
  it('finds the words a negation applies to', () => {
    expect([...negatedStems("It did not resist corrosion, and it isn't proven.")].sort()).toEqual([stem('resist'), stem('corrosion'), stem('proven')].sort());
    expect(negatedStems('The pillar resisted corrosion.').size).toBe(0);
  });

  it('catches an answer that says the opposite of the knowledge base', async () => {
    const truth = await truthOf(pillar, 'What is the Delhi Iron Pillar?');
    const opposite = score(truth, 'The Delhi Iron Pillar was erected in the 4th century CE but has not resisted corrosion for more than 1600 years.\n\nSource: Archaeological Survey of India notes (interpretation).');
    const same = score(truth, 'The Delhi Iron Pillar was erected in the 4th century CE and has resisted corrosion for more than 1600 years.\n\nSource: Archaeological Survey of India notes (interpretation).');
    expect(statuses(opposite)).toContain('conflict');
    expect(opposite.claims.find((c) => c.status === 'conflict').note).toMatch(/opposite/);
    expect(same.score - opposite.score).toBeGreaterThanOrEqual(1.5);
    expect(opposite.risk.level).toBe('high');
  });

  it('catches an answer that asserts what the entry denies (the calculus trap)', async () => {
    const truth = await truthOf(calculus, 'Did the Kerala school invent calculus?');
    const trap = score(truth, 'Madhava and his successors developed infinite series. There was a general theory of differentiation and integration.');
    const honest = score(truth, 'Madhava and his successors developed infinite series. There was no general theory of differentiation and integration.');
    expect(statuses(trap)).toContain('conflict');
    expect(statuses(honest)).not.toContain('conflict');
    expect(honest.score).toBeGreaterThan(trap.score);
  });

  it('does not mistake a hedge, or repeating the entry’s own caution, for a contradiction', async () => {
    const truth = await truthOf(pillar, 'What is the Delhi Iron Pillar?');
    const hedge = score(truth, 'Metallurgists link the corrosion resistance to its phosphorus-rich wrought iron; this is an interpretation, not settled fact.');
    const caution = score(truth, 'Modern studies avoid unexplained-miracle claims about the pillar.');
    expect(statuses(hedge)).not.toContain('conflict');
    expect(statuses(caution)).not.toContain('conflict');
  });
});

describe('the label an answer puts on its source must be the entry’s own', () => {
  it('flags an interpretation presented as verified maths, more than a mild mismatch', async () => {
    const truth = await truthOf(pillar, 'What is the Delhi Iron Pillar?');
    const body = 'Scholars suggest that the Delhi Iron Pillar has resisted corrosion for more than 1600 years because of its phosphorus-rich wrought iron.';
    const right = score(truth, `${body}\n\nSource: Archaeological Survey of India notes (interpretation).`);
    const inflated = score(truth, `${body}\n\nSource: Archaeological Survey of India notes (verified maths).`);
    const mild = score(truth, `${body}\n\nSource: Archaeological Survey of India notes (traditional text).`);
    expect(right.breakdown[2].score - inflated.breakdown[2].score).toBeCloseTo(0.5, 5);
    const mildCut = right.breakdown[2].score - mild.breakdown[2].score;
    expect(mildCut).toBeGreaterThan(0.1); // a quarter point, shown rounded to one decimal
    expect(mildCut).toBeLessThan(0.35);
    expect(inflated.breakdown[2].notes.some((n) => /overstates how certain/.test(n.text))).toBe(true);
  });
});
