import { multiply } from './solver/index.js';
import { synonymFamilies } from './textutil.js';

// Test material for the answer checker (services/verifier.js). Nothing here calls an AI: good answers are
// assembled from the knowledge base itself, and each "bad" answer is that same answer with ONE realistic flaw.
// A trustworthy checker must score every good answer above every flawed copy of it.

const firstWords = (text, n) => String(text).replace(/\s+/g, ' ').trim().split(' ').slice(0, n).join(' ');
const PROVENANCE_LABEL = { verified_math: 'verified maths', traditional_text: 'traditional text', interpretation: 'interpretation' };

export function questionFor(entry) {
  const name = entry.name.trim();
  return /\?$/.test(name) ? name : `Tell me about ${name}`;
}

const isHealth = (e) => /medic|ayurved|health/i.test(`${e.category} ${(e.tags ?? []).join(' ')}`);

// The same answer written as if the tradition were settled fact: no "according to", no provenance label.
function stripAttribution(text) {
  return text
    .replace('According to the traditional text, ', '')
    .replace(/ \((?:traditional text|interpretation|verified maths)\)/, '')
    .replace(/\b(according to|as per|traditionally|traditional|attributed to|attributes?|is said to|are said to|credited|claims?|described in|texts? (?:say|says|state|states|describe|describes|mention|mentions))\b/gi, '');
}

// What a careful answer looks like for this entry: its own facts, the right wording for its provenance, its source.
export function goodAnswer(entry) {
  const cue = entry.provenance === 'traditional_text' ? 'According to the traditional text, ' : entry.provenance === 'interpretation' ? 'Scholars offer this as an interpretation: ' : '';
  const body = firstWords(entry.meaning || entry.whenToUse || entry.name, 55);
  const source = `Source: ${entry.source} (${PROVENANCE_LABEL[entry.provenance]}).`;
  const note = isHealth(entry) ? '\n\nEducational only, not medical advice.' : '';
  return `${cue}${entry.name}${entry.sanskrit ? ` (${entry.sanskrit})` : ''}: ${body.replace(/[.!?]?$/, '.')}\n\n${source}${note}`;
}

// The same answer in other words: words from this domain's synonym families are swapped ("erected" -> "built",
// "resisted" -> "withstood"). Only the body is touched, never the source line. A careful answer must STAY careful.
export function paraphrase(text) {
  const [body, ...rest] = text.split('\n\n');
  const swapped = body.replace(/[A-Za-z]+/g, (word) => {
    const lower = word.toLowerCase();
    const family = synonymFamilies.find((f) => f.includes(lower));
    if (!family) return word;
    const other = family.find((w) => w !== lower && /^[a-z]+$/.test(w) && !w.startsWith(lower.slice(0, 4)));
    if (!other) return word;
    return word[0] === word[0].toUpperCase() ? other[0].toUpperCase() + other.slice(1) : other;
  });
  return [swapped, ...rest].join('\n\n');
}

// "was" -> "was not", "has" -> "has not": the first plain statement turned into its opposite.
function negate(body) {
  return body.replace(/\b(was|were|is|are|has|have|can|did)\b(?!\s+not)/, '$1 not');
}

// Each flaw keeps everything else the same. minGap = how much lower the flawed copy must score (out of 10).
export function flawedAnswers(entry) {
  const good = goodAnswer(entry);
  const sourceLine = /\n\nSource:[^\n]*/;
  const out = [
    { flaw: 'no source cited', text: good.replace(sourceLine, ''), minGap: 1.0 },
    { flaw: 'invented source', text: good.replace(/Source:[^\n]*/, 'Source: Brihad Zyxqwv Samhita, chapter 14 (traditional text).'), minGap: 0.7 },
    { flaw: 'invented date', text: good.replace(/\n\nSource/, ' It was composed in 1337 CE by a famous scholar.\n\nSource'), minGap: 0.9 },
    { flaw: 'empty of facts', text: 'This is a very interesting topic that many people enjoy learning about. It has a long and rich history, and there is a lot more to say about it.\n\nSource: various ancient texts.', minGap: 2.0 },
    { flaw: 'off the subject', text: 'Paris is the capital of France and is well known for its museums and cafes.', minGap: 3.0 },
  ];
  if (entry.provenance !== 'verified_math') {
    out.push({ flaw: 'overclaims', text: good.replace(/\n\nSource/, ' This is proven beyond doubt and shows a lost advanced technology.\n\nSource'), minGap: 0.4 });
    if (entry.provenance === 'traditional_text') out.push({ flaw: 'states a tradition as plain fact', text: stripAttribution(good), minGap: 0.4 });
  }
  // The first statement of the body turned into its opposite ("was erected" -> "was not erected").
  const [head, ...tail] = good.split('\n\n');
  const opposite = negate(head);
  if (opposite !== head && !/\bnot\b/i.test(head)) out.push({ flaw: 'says the opposite', text: [opposite, ...tail].join('\n\n'), minGap: 0.9 });
  // The source labelled as more certain than it is.
  if (entry.provenance !== 'verified_math') out.push({ flaw: 'overstates the provenance label', text: good.replace(/\((?:traditional text|interpretation)\)/, '(verified maths)'), minGap: 0.4 });
  // The same sentence with one figure changed (for example "1600 years" becomes "2237 years").
  const figure = (good.split('\n\n')[0].match(/\b\d{2,4}\b/g) ?? []).find((n) => !/^(19|20)\d\d$/.test(n) || true);
  if (figure) out.push({ flaw: 'changed a figure', text: good.replace(new RegExp(`\\b${figure}\\b`), String(Number(figure) + 137)), minGap: 0.9 });
  if (isHealth(entry)) out.push({ flaw: 'no health note', text: good.replace(/\s*educational only[^.\n]*\.?/gi, '').replace(/\s*not (a substitute for )?medical advice\.?/gi, ''), minGap: 0.3 });
  return out;
}

// Random multiplication cases with a right answer and several wrong ones.
export function calcCases(count, rand = Math.random) {
  const cases = [];
  for (let i = 0; i < count; i++) {
    const a = 11 + Math.floor(rand() * 989);
    const b = 11 + Math.floor(rand() * 989);
    const right = multiply(String(a), String(b)).answer;
    const wrongs = [
      String(BigInt(right) + BigInt(1 + Math.floor(rand() * 9))),
      String(BigInt(right) - BigInt(10 * (1 + Math.floor(rand() * 9)))),
      right.length > 3 ? right.slice(0, 1) + right.slice(2, 3) + right.slice(1, 2) + right.slice(3) : String(BigInt(right) + 100n), // two digits swapped
    ].filter((w) => w !== right);
    cases.push({ question: `Multiply ${a} × ${b} using a Vedic technique`, a, b, right, wrongs });
  }
  return cases;
}

export const calcGoodAnswer = (c) => ({
  text: `Using a Vedic sutra, ${c.a} × ${c.b} = ${c.right}. The working is in the steps above.`,
  toolsUsed: ['vedic_multiply'],
  solver: [{ tool: 'vedic_multiply', answer: c.right }],
});
export const calcBadAnswer = (c, wrong, usedTool = true) => ({
  text: `Using a Vedic sutra, ${c.a} × ${c.b} = ${wrong}. The working is in the steps above.`,
  toolsUsed: usedTool ? ['vedic_multiply'] : [],
  solver: usedTool ? [{ tool: 'vedic_multiply', answer: wrong }] : [],
});
