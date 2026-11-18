import { describe, it, expect } from 'vitest';
import { buildGroundTruth, checkArithmetic, scoreAnswer } from '../services/verifier.js';
import { analyseClaims, splitSentences, figureAllowed } from '../services/claims.js';
import './helpers.js';

const pillar = {
  name: 'Delhi Iron Pillar',
  sanskrit: '',
  meaning: 'The Iron Pillar of Delhi was erected in the 4th century CE. It has resisted corrosion for more than 1600 years. Metallurgists link this to its phosphorus-rich wrought iron.',
  whenToUse: '', steps: [], examples: [], tags: ['iron', 'pillar', 'delhi', 'metallurgy'], category: 'metallurgy',
  source: 'Archaeological Survey of India notes', provenance: 'interpretation',
};
const search = async () => [pillar];
const truthOf = () => buildGroundTruth('What is the Delhi Iron Pillar?', { search, sources: [pillar.source] });
const statuses = (r) => r.claims.filter((c) => c.status !== 'meta').map((c) => c.status);

describe('splitting an answer into claims', () => {
  it('drops markdown, list marks and code, and splits sentences and lines', () => {
    const out = splitSentences('## Heading\n- **First** point is here. Second sentence follows!\n1. Numbered item\n```\ncode\n```');
    expect(out).toEqual(['Heading', 'First point is here.', 'Second sentence follows!', 'Numbered item']);
  });
});

describe('dates and figures', () => {
  it('a "4th century CE" entry allows years 301-400, but not others', async () => {
    const truth = await truthOf();
    expect(figureAllowed('400', truth)).toBe(true);
    expect(figureAllowed('350', truth)).toBe(true);
    expect(figureAllowed('1600', truth)).toBe(true);
    expect(figureAllowed('1337', truth)).toBe(false);
    expect(figureAllowed('450', truth)).toBe(false);
  });
});

describe('dates: careful hedging costs less than a flat claim', () => {
  it('treats "around 1337 CE" as approximate, and "in 1337 CE" as a flat claim', async () => {
    const truth = await truthOf();
    const base = 'The Delhi Iron Pillar has resisted corrosion for more than 1600 years because of its phosphorus-rich wrought iron.';
    const flat = scoreAnswer(truth, { text: `${base} It was made in 1337 CE.`, toolsUsed: ['searchKnowledge'] }, { style: 'balanced' });
    const hedged = scoreAnswer(truth, { text: `${base} It was made around 1337 CE.`, toolsUsed: ['searchKnowledge'] }, { style: 'balanced' });
    const clean = scoreAnswer(truth, { text: base, toolsUsed: ['searchKnowledge'] }, { style: 'balanced' });
    expect(clean.breakdown[0].score - flat.breakdown[0].score).toBeCloseTo(1.5, 5);
    expect(clean.breakdown[0].score - hedged.breakdown[0].score).toBeCloseTo(0.6, 5);
    expect(hedged.score).toBeGreaterThan(flat.score);
  });
});

describe('claim-by-claim verdicts', () => {
  const good = 'The Delhi Iron Pillar was erected around 400 CE. It has resisted corrosion for more than 1600 years because of its phosphorus-rich wrought iron.\n\nWould you like to hear more?\n\nSource: Archaeological Survey of India notes (interpretation).';
  const wrongFigure = 'The Delhi Iron Pillar was erected around 400 CE. It has resisted corrosion for more than 2500 years because of its phosphorus-rich wrought iron.\n\nSource: Archaeological Survey of India notes (interpretation).';

  it('marks sentences that say what the knowledge base says as supported, and ignores chatter', async () => {
    const truth = await truthOf();
    const r = scoreAnswer(truth, { text: good, toolsUsed: ['searchKnowledge'] }, { style: 'balanced' });
    expect(statuses(r)).toEqual(['supported', 'supported']);
    expect(r.claims.some((c) => c.status === 'meta' && /Would you like/.test(c.text))).toBe(true);
    expect(r.stats).toMatchObject({ total: 2, supported: 2, flagged: 0 });
    expect(r.risk.level).toBe('low');
    expect(r.seal).toBe('verified');
  });

  it('catches a figure that contradicts the knowledge base, even though it is not a year', async () => {
    const truth = await truthOf();
    const clean = scoreAnswer(truth, { text: good, toolsUsed: ['searchKnowledge'] }, { style: 'balanced' });
    const r = scoreAnswer(truth, { text: wrongFigure, toolsUsed: ['searchKnowledge'] }, { style: 'balanced' });
    expect(statuses(r)).toEqual(['supported', 'conflict']);
    const flagged = r.claims.find((c) => c.status === 'conflict');
    expect(flagged.note).toMatch(/1600/);
    expect(clean.score - r.score).toBeGreaterThanOrEqual(1.5);
    expect(r.risk.level).toBe('high');
    expect(r.risk.reasons[0]).toMatch(/contradict/);
    expect(r.seal).not.toBe('verified');
  });

  it('flags a date found nowhere, and a made-up source raises the risk', async () => {
    const truth = await truthOf();
    const r = scoreAnswer(truth, { text: 'The pillar was cast in 1337 CE by a famous scholar.\n\nSource: Brihad Zyxqwv Samhita.', toolsUsed: ['searchKnowledge'] }, { style: 'balanced' });
    expect(r.claims.some((c) => c.status === 'unsourced' || c.status === 'conflict')).toBe(true);
    expect(r.risk.level).not.toBe('low');
  });

  it('flags overclaiming wording as its own kind of claim, and a caution against it is not an overclaim', async () => {
    const truth = await truthOf();
    const r = scoreAnswer(truth, { text: 'The pillar is a miracle of lost advanced technology.\n\nModern studies avoid unexplained-miracle claims about the pillar.', toolsUsed: ['searchKnowledge'] }, { style: 'balanced' });
    expect(statuses(r)).toEqual(['overclaim', 'general']);
    expect(r.risk.level).toBe('medium');
    expect(r.risk.reasons.join(' ')).toMatch(/overclaiming/);
  });

  it('says "general" for harmless sentences the knowledge base cannot confirm', async () => {
    const truth = await truthOf();
    const r = scoreAnswer(truth, { text: 'Many visitors travel to see it every year and take photographs of the ancient monument.', toolsUsed: ['searchKnowledge'] }, { style: 'balanced' });
    expect(statuses(r)).toEqual(['general']);
  });
});

describe('claims in calculation answers', () => {
  it('verifies the result and the working, and flags wrong working or a wrong final answer', async () => {
    const truth = await buildGroundTruth('Multiply 98 × 97 using a Vedic technique');
    const solver = [{ tool: 'vedic_multiply', answer: '9506' }];
    const ok = scoreAnswer(truth, { text: 'Both numbers are just below 100. Their deficits are 2 and 3, and 2 × 3 = 6. The answer is 9506.', toolsUsed: ['vedic_multiply'], solver }, { style: 'brief' });
    expect(statuses(ok)).toEqual(['general', 'verified', 'verified']);
    expect(ok.seal).toBe('verified');

    const bad = scoreAnswer(truth, { text: 'Their deficits are 2 and 3, and 2 × 3 = 7. The answer is 9507.', toolsUsed: ['vedic_multiply'], solver }, { style: 'brief' });
    expect(statuses(bad)).toEqual(['wrong', 'wrong']);
    expect(bad.risk.level).toBe('high');
    expect(bad.seal).toBe('unreliable');
    expect(checkArithmetic('2 × 3 = 7').wrong).toHaveLength(1);
  });
});

describe('analyseClaims can be used on its own', () => {
  it('returns an empty analysis for an empty answer', async () => {
    const truth = await truthOf();
    expect(analyseClaims(truth, '', () => ({ checked: 0, wrong: [] })).stats.total).toBe(0);
  });
});
