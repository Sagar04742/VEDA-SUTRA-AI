import { describe, it, expect } from 'vitest';
import { buildGroundTruth, decideWinner, detectCalculation, scoreAnswer } from '../services/verifier.js';
import './helpers.js';

const pillar = {
  id: '1',
  name: 'Delhi Iron Pillar',
  sanskrit: '',
  meaning: 'The Iron Pillar of Delhi was erected around 400 CE. It has resisted corrosion for more than 1600 years, which scholars link to its phosphorus-rich wrought iron. Traditional accounts connect it with Chandragupta.',
  whenToUse: '',
  steps: [],
  examples: [],
  tags: ['iron', 'pillar', 'delhi', 'metallurgy'],
  category: 'metallurgy',
  source: 'Archaeological Survey of India notes',
  provenance: 'interpretation',
};
const bhasma = {
  id: '2',
  name: 'Rasashastra bhasma preparation',
  sanskrit: 'रसशास्त्र',
  meaning: 'Rasashastra describes the calcination of metals into bhasma using herbal juices, as recorded in medieval Ayurvedic texts.',
  whenToUse: '',
  steps: [],
  examples: [],
  tags: ['bhasma', 'rasashastra', 'ayurveda'],
  category: 'medicine',
  source: 'Rasa Ratna Samuccaya',
  provenance: 'traditional_text',
};
const search = (entries) => async () => entries;

describe('calculation detection', () => {
  it('finds the sum the user asked for', () => {
    expect(detectCalculation('Multiply 98 × 97 using a Vedic technique')).toMatchObject({ name: 'vedic_multiply', args: { a: '98', b: '97' } });
    expect(detectCalculation('what is 1,003 x 998')).toMatchObject({ name: 'vedic_multiply', args: { a: '1003', b: '998' } });
    expect(detectCalculation('square of 95')).toMatchObject({ name: 'vedic_square', args: { number: '95' } });
    expect(detectCalculation('is 2184 divisible by 8?')).toMatchObject({ name: 'check_divisibility', args: { number: '2184', divisor: 8 } });
    expect(detectCalculation('digit sum of 4567')).toMatchObject({ name: 'digit_sum' });
    expect(detectCalculation('vinculum form of 68')).toMatchObject({ name: 'vinculum_convert', args: { number: '68' } });
    expect(detectCalculation('1234 divided by 9')).toMatchObject({ name: 'vedic_divide_by_9' });
    expect(detectCalculation('What is the Delhi Iron Pillar?')).toBeNull();
  });
});

describe('calculation answers are scored against the exact solver', () => {
  it('full marks for the right answer using the solver and naming the method', async () => {
    const truth = await buildGroundTruth('Multiply 98 × 97 using a Vedic technique');
    expect(truth.kind).toBe('calculation');
    expect(truth.calc.answer).toBe('9506');
    const r = scoreAnswer(truth, {
      text: 'Using Nikhilam, 98 × 97 = **9506**. Both numbers are just below 100, so you subtract crosswise and multiply the deficits.',
      toolsUsed: ['vedic_multiply'],
      solver: [{ tool: 'vedic_multiply', answer: '9506' }],
    });
    expect(r.score).toBe(10);
    expect(r.breakdown.map((c) => c.score)).toEqual([4, 3, 2, 1]);
    expect(r.evidence.checkedAgainst).toBe('exact solver');
  });

  it('zero accuracy for a wrong answer, and the solver is not credited', async () => {
    const truth = await buildGroundTruth('Multiply 98 × 97 using a Vedic technique');
    const r = scoreAnswer(truth, { text: 'The answer is 9507. Nice question!', toolsUsed: [], solver: [] });
    expect(r.breakdown[0].score).toBe(0); // accuracy
    expect(r.breakdown[1].score).toBe(0); // grounding
    expect(r.breakdown[2].score).toBe(0.5); // honesty: states a number the solver contradicts
    expect(r.score).toBeLessThan(3);
  });

  it('half accuracy when the right result appears next to a contradicting claim', async () => {
    const truth = await buildGroundTruth('square of 95');
    expect(truth.calc.answer).toBe('9025');
    const r = scoreAnswer(truth, { text: 'The square is 9025, so the answer is 9125.', toolsUsed: ['vedic_square'], solver: [{ tool: 'vedic_square', answer: '9025' }] });
    expect(r.breakdown[0].score).toBe(2);
  });

  it('understands yes/no, quotient and vinculum answers', async () => {
    const div = await buildGroundTruth('is 2184 divisible by 8?');
    expect(div.calc.divisible).toBe(true);
    expect(scoreAnswer(div, { text: 'Yes, 2184 is divisible by 8 (the last three digits 184 ÷ 8 = 23).', toolsUsed: ['check_divisibility'], solver: [] }).breakdown[0].score).toBe(4);
    expect(scoreAnswer(div, { text: 'No, 2184 is not divisible by 8.', toolsUsed: [], solver: [] }).breakdown[0].score).toBe(0);

    const nine = await buildGroundTruth('1234 divided by 9');
    expect(scoreAnswer(nine, { text: '1234 ÷ 9 = 137 remainder 1.', toolsUsed: [], solver: [] }).breakdown[0].score).toBe(4);
    expect(scoreAnswer(nine, { text: '1234 ÷ 9 = 138 remainder 1.', toolsUsed: [], solver: [] }).breakdown[0].score).toBe(0);

    const vin = await buildGroundTruth('vinculum form of 68');
    expect(scoreAnswer(vin, { text: `68 is written 1 3${'̄'} 2${'̄'} in vinculum.`, toolsUsed: [], solver: [] }).breakdown[0].score).toBe(4);
  });

  it('is deterministic: the same answer always gets the same score', async () => {
    const truth = await buildGroundTruth('square of 95');
    const answer = { text: 'It is 9025.', toolsUsed: ['vedic_square'], solver: [] };
    expect(JSON.stringify(scoreAnswer(truth, answer))).toBe(JSON.stringify(scoreAnswer(truth, answer)));
  });
});

describe('knowledge answers are scored against the knowledge base and its provenance labels', () => {
  const good =
    'The Delhi Iron Pillar was erected around 400 CE and has resisted corrosion for more than 1600 years. Scholars link this to its phosphorus-rich wrought iron, and traditional accounts connect it with Chandragupta; this is an interpretation, not settled fact.\n\nSource: Archaeological Survey of India notes (interpretation).';
  const poor = 'The Delhi Iron Pillar is a miracle of lost advanced technology, proven to be made in 1200 BCE. It never rusts.';

  it('rewards facts, source, and honest wording; punishes invention and overclaiming', async () => {
    const truth = await buildGroundTruth('What is the Delhi Iron Pillar?', { search: search([pillar]) });
    expect(truth.kind).toBe('knowledge');
    expect(truth.evidence[0].name).toBe('Delhi Iron Pillar');
    const a = scoreAnswer(truth, { text: good, toolsUsed: ['searchKnowledge'] });
    const b = scoreAnswer(truth, { text: poor, toolsUsed: [] });
    expect(a.score).toBeGreaterThanOrEqual(9);
    expect(b.score).toBeLessThanOrEqual(4);
    expect(b.breakdown[2].notes.some((n) => /Overclaim/.test(n.text) && !n.ok)).toBe(true);
    expect(b.breakdown[0].notes.some((n) => /1200/.test(n.text))).toBe(true); // invented date flagged
    expect(decideWinner(a.score, b.score)).toBe('a');
  });

  it('wants "according to" wording for traditional-text entries', async () => {
    const truth = await buildGroundTruth('How were bhasmas prepared in Rasashastra?', { search: search([bhasma]) });
    expect(truth.needsDisclaimer).toBe(true);
    const plain = 'Rasashastra describes calcination of metals into bhasma using herbal juices in Ayurvedic texts. Source: Rasa Ratna Samuccaya.';
    const careful = 'According to the Rasa Ratna Samuccaya, Rasashastra describes calcination of metals into bhasma using herbal juices in medieval Ayurvedic texts. Source: Rasa Ratna Samuccaya (traditional text). Educational only, not medical advice.';
    const a = scoreAnswer(truth, { text: careful, toolsUsed: ['searchKnowledge'] });
    const b = scoreAnswer(truth, { text: plain, toolsUsed: ['searchKnowledge'] });
    expect(a.breakdown[2].score).toBe(2);
    expect(b.breakdown[2].score).toBeLessThan(a.breakdown[2].score);
    expect(b.breakdown[2].notes.some((n) => /medical advice/.test(n.text) && !n.ok)).toBe(true);
  });

  it('ignores weak, unrelated search hits', async () => {
    const truth = await buildGroundTruth('Tell me about Egyptian pyramids', { search: search([pillar]) });
    expect(truth.kind).not.toBe('knowledge');
  });

  it('uses the previous question for follow-ups', async () => {
    let seen;
    await buildGroundTruth('What is it made of?', { context: ['What is the Delhi Iron Pillar?'], search: async (q) => ((seen = q), [pillar]) });
    expect(seen).toMatch(/Delhi Iron Pillar/);
  });
});

describe('questions with nothing to check against', () => {
  it('rewards an honest "not in the knowledge base" and punishes bluffing', async () => {
    const truth = await buildGroundTruth('What did Aryabhata say about dinosaurs in Vedic times?', { search: search([]) });
    expect(truth.kind).toBe('unknown_topic');
    const honest = scoreAnswer(truth, { text: "My knowledge base has nothing on that, so I won't guess. I'd be glad to share what it does hold about Aryabhata.", toolsUsed: ['searchKnowledge'] });
    const bluff = scoreAnswer(truth, { text: 'Aryabhata wrote in 499 CE that dinosaurs lived in the Vedic age. Source: Aryabhatiya, verse 12.', toolsUsed: [] });
    expect(honest.score).toBeGreaterThanOrEqual(9);
    expect(bluff.score).toBeLessThanOrEqual(3);
  });

  it('expects a polite redirect for off-topic questions', async () => {
    const truth = await buildGroundTruth('Who won the cricket world cup?', { search: search([]) });
    expect(truth.kind).toBe('offtopic');
    expect(scoreAnswer(truth, { text: 'That is outside my focus, but I can help with Vedic maths and ancient science. Shall we try a quick calculation?' }).breakdown[0].score).toBe(4);
    expect(scoreAnswer(truth, { text: 'India won in 1983 and 2011, a great story that goes on for many paragraphs of cricket details. '.repeat(10) }).breakdown[0].score).toBe(0);
  });

  it('does not call a Hindi question "unknown": its facts are simply not checked, and the total is rescaled', async () => {
    const truth = await buildGroundTruth('वैदिक गणित में वर्ग करने की सबसे आसान विधि क्या है?', { search: search([]) });
    expect(truth.kind).toBe('unchecked');
    expect(truth.checkedAgainst).toBe('none');
    const r = scoreAnswer(truth, { text: 'पाँच पर समाप्त होने वाली संख्याओं का वर्ग एकाधिकेन पूर्वेण से आसानी से निकलता है। स्रोत: वैदिक गणित संग्रह।', toolsUsed: ['searchKnowledge'] });
    expect(r.breakdown[0].skipped).toBe(true);
    expect(r.score).toBe(10); // 3 + 2 + 1 of 6, scaled to 10
    const bare = scoreAnswer(truth, { text: 'पाँच पर समाप्त होने वाली संख्याओं का वर्ग आसानी से निकलता है।', toolsUsed: [] });
    expect(bare.score).toBeCloseTo(((0 + 2 + 1) / 6) * 10, 1);
  });

  it('treats greetings as friendly small talk', async () => {
    const truth = await buildGroundTruth('Namaste!');
    expect(truth.kind).toBe('smalltalk');
    expect(scoreAnswer(truth, { text: 'Namaste! How can I help you today?' }).score).toBe(10);
  });
});

describe('clarity and edge cases', () => {
  it('checks the reply language and rejects LaTeX', async () => {
    const truth = await buildGroundTruth('९८ × ९७ का गुणा कैसे करें? वैदिक गणित में 98 × 97 बताइए');
    const hindi = scoreAnswer(truth, { text: '98 × 97 = 9506। निखिलम् विधि से यह आसानी से हो जाता है।', toolsUsed: ['vedic_multiply'], solver: [{ tool: 'vedic_multiply', answer: '9506' }] });
    const english = scoreAnswer(truth, { text: 'The answer is 9506 using Nikhilam.', toolsUsed: ['vedic_multiply'], solver: [{ tool: 'vedic_multiply', answer: '9506' }] });
    expect(hindi.breakdown[3].score).toBe(1);
    expect(english.breakdown[3].score).toBe(0.6);
    const t2 = await buildGroundTruth('square of 12');
    expect(scoreAnswer(t2, { text: 'It is $12^2 = 144$', toolsUsed: [] }).breakdown[3].notes.find((n) => /LaTeX/.test(n.text)).ok).toBe(false);
  });

  it('gives an empty answer zero', async () => {
    const truth = await buildGroundTruth('square of 12');
    expect(scoreAnswer(truth, { text: '' }).score).toBe(0);
  });

  it('declares a tie when scores are within half a point', () => {
    expect(decideWinner(8.2, 8.5)).toBe('tie');
    expect(decideWinner(9, 7.5)).toBe('a');
    expect(decideWinner(6, 8)).toBe('b');
    expect(decideWinner(null, 5)).toBeNull();
  });
});
