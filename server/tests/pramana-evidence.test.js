import { describe, it, expect } from 'vitest';
import { buildGroundTruth, scoreAnswer } from '../services/verifier.js';
import { describeResult } from '../services/activity.js';
import './helpers.js';

const pillar = {
  name: 'Delhi Iron Pillar', sanskrit: '', tags: ['iron', 'pillar', 'delhi', 'metallurgy'], category: 'metallurgy',
  source: 'Archaeological Survey of India notes', provenance: 'interpretation',
  meaning: 'The Iron Pillar of Delhi was erected in the 4th century CE. It has resisted corrosion for more than 1600 years.',
  whenToUse: '', steps: [], examples: [],
};
const truthOf = () => buildGroundTruth('What is the Delhi Iron Pillar?', { search: async () => [pillar], sources: [pillar.source] });
const score = (truth, text, extra = {}) => scoreAnswer(truth, { text, toolsUsed: ['searchKnowledge'], ...extra }, { style: 'balanced' });
const statuses = (r) => r.claims.filter((c) => c.status !== 'meta').map((c) => c.status);

describe('what the model read on the web counts as evidence for what it says', () => {
  const retrieved = [{ kind: 'web', title: 'Iron pillar of Delhi', url: 'https://en.wikipedia.org/wiki/Iron_pillar_of_Delhi', text: 'The iron pillar of Delhi stands in the Qutb complex at Mehrauli. It is 7.21 metres high and weighs more than six tonnes. It was first set up at Udayagiri.' }];

  it('a sentence taken from the page the model read is marked as matching Wikipedia, not as unknown', async () => {
    const truth = await truthOf();
    const text = 'The iron pillar of Delhi stands in the Qutb complex at Mehrauli and is 7.21 metres high.';
    const without = score(truth, text);
    const withWeb = score(truth, text, { retrieved });
    expect(statuses(without)).toEqual(['unsourced']); // 7.21 appears nowhere we know of
    expect(statuses(withWeb)).toEqual(['web']);
    expect(withWeb.claims[0].note).toMatch(/Wikipedia page the model read: Iron pillar of Delhi/);
    expect(withWeb.breakdown[0].score).toBeGreaterThanOrEqual(without.breakdown[0].score);
  });

  it('but a figure that is on neither our data nor the page it read is still flagged', async () => {
    const truth = await truthOf();
    const r = score(truth, 'The iron pillar of Delhi stands in the Qutb complex at Mehrauli and is 9.99 metres high.', { retrieved });
    expect(statuses(r)).toEqual(['conflict']);
    expect(r.risk.level).toBe('high');
  });

  it('web pages only help the sentences that rely on them: the knowledge-base score is unchanged', async () => {
    const truth = await truthOf();
    const text = 'The Delhi Iron Pillar was erected in the 4th century CE and has resisted corrosion for more than 1600 years.';
    expect(score(truth, text, { retrieved }).breakdown[0].score).toBe(score(truth, text).breakdown[0].score);
  });
});

describe('an answer that disagrees with itself', () => {
  it('flags the later sentence and costs accuracy', async () => {
    const truth = await truthOf();
    const consistent = score(truth, 'The Delhi Iron Pillar was erected in the 4th century CE. The Delhi Iron Pillar has resisted corrosion for more than 1600 years.');
    const confused = score(truth, 'The Delhi Iron Pillar has resisted corrosion for more than 1600 years. The Delhi Iron Pillar has resisted corrosion for more than 2100 years.');
    expect(statuses(consistent)).not.toContain('inconsistent');
    expect(statuses(confused)).toContain('inconsistent');
    expect(confused.claims.find((c) => c.status === 'inconsistent').note).toMatch(/Disagrees with an earlier sentence/);
    expect(consistent.score).toBeGreaterThan(confused.score);
    expect(confused.risk.reasons.join(' ')).toMatch(/contradict the answer itself/);
  });

  it('does not treat different things, or repeating the same figure, as a contradiction', async () => {
    const truth = await truthOf();
    const r = score(truth, 'The pillar has resisted corrosion for more than 1600 years. Its wrought iron has been studied for 1600 years by metallurgists. The nearby tower is 73 metres tall.');
    expect(statuses(r)).not.toContain('inconsistent');
  });
});

describe('the library cards show real entries', () => {
  it('describes the entries and pages a search returned', () => {
    const k = describeResult('searchKnowledge', { results: [{ name: 'Delhi Iron Pillar', source: 'ASI notes', provenance: 'interpretation', category: 'metallurgy' }, { name: 'Iron', source: 'S', provenance: 'verified_math', category: 'metals' }] });
    expect(k.entries).toEqual([
      { name: 'Delhi Iron Pillar', source: 'ASI notes', provenance: 'interpretation', category: 'metallurgy' },
      { name: 'Iron', source: 'S', provenance: 'verified_math', category: 'metals' },
    ]);
    const w = describeResult('searchWeb', { results: [{ title: 'Iron pillar of Delhi', url: 'https://x/y', extract: 'long' }] });
    expect(w.pages).toEqual([{ title: 'Iron pillar of Delhi', url: 'https://x/y' }]);
    expect(describeResult('searchKnowledge', { results: [] }).entries).toBeUndefined();
  });
});
