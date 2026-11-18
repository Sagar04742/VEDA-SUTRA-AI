// What kind of question is this? Plain pattern rules (no AI). Used in two places:
//   - the answering pipeline, to make the first model turn use the right tool (so no model can skip the solver
//     or the knowledge base), and
//   - the answer checker (verifier.js), to know which ground truth to check against.

const clean = (s) => String(s).replace(/,/g, '');

const CALC_PATTERNS = [
  { re: /(\d[\d,]*)\s*(?:x|×|✕|\*|times|multiplied by|गुणा)\s*(\d[\d,]*)/i, tool: (m) => ({ name: 'vedic_multiply', args: { a: clean(m[1]), b: clean(m[2]) } }), label: (m) => `${clean(m[1])} × ${clean(m[2])}` },
  { re: /multipl(?:y|ication of)\s+(\d[\d,]*)\s*(?:and|by|with)\s*(\d[\d,]*)/i, tool: (m) => ({ name: 'vedic_multiply', args: { a: clean(m[1]), b: clean(m[2]) } }), label: (m) => `${clean(m[1])} × ${clean(m[2])}` },
  { re: /(\d[\d,]*)\s*(?:÷|\/|divided by)\s*9\b/i, tool: (m) => ({ name: 'vedic_divide_by_9', args: { number: clean(m[1]) } }), label: (m) => `${clean(m[1])} ÷ 9` },
  { re: /square of (\d[\d,]*)|(\d[\d,]*)\s*(?:squared|\^2|²)|(?:squar(?:e|ing))\s+(\d[\d,]*)/i, tool: (m) => ({ name: 'vedic_square', args: { number: clean(m[1] ?? m[2] ?? m[3]) } }), label: (m) => `${clean(m[1] ?? m[2] ?? m[3])}²` },
  { re: /(\d[\d,]*)\s+(?:is\s+)?divisible by\s+(\d+)|is\s+(\d[\d,]*)\s+divisible by\s+(\d+)/i, tool: (m) => ({ name: 'check_divisibility', args: { number: clean(m[1] ?? m[3]), divisor: Number(m[2] ?? m[4]) } }), label: (m) => `is ${clean(m[1] ?? m[3])} divisible by ${m[2] ?? m[4]}?` },
  { re: /digit(?:al)? (?:sum|root) of (\d[\d,]*)/i, tool: (m) => ({ name: 'digit_sum', args: { number: clean(m[1]) } }), label: (m) => `digit sum of ${clean(m[1])}` },
  { re: /vinculum[^\d]*(\d[\d,]*)|(\d[\d,]*)[^\d]*vinculum/i, tool: (m) => ({ name: 'vinculum_convert', args: { number: clean(m[1] ?? m[2]) } }), label: (m) => `vinculum form of ${clean(m[1] ?? m[2])}` },
];

// { name: 'vedic_multiply', args: { a, b }, label: '98 × 97' } or null
export function detectCalculation(text) {
  const t = String(text ?? '');
  for (const p of CALC_PATTERNS) {
    const m = t.match(p.re);
    if (m) return { ...p.tool(m), label: p.label(m) };
  }
  return null;
}

export const SMALLTALK = /^\s*(hi+|hello+|hey+|namaste|namaskar|good (morning|afternoon|evening)|thanks?|thank you|thx|ok(ay)?|bye|goodbye|how are you)\b[\s!.?,a-z]*$/i;

// Which tool the model must call first for this message:
//   'solver'          a calculation (any solver tool; the model picks the matching one)
//   'searchKnowledge' anything else that is a real question
//   null              a greeting, or a picture with no words (the model decides)
export function firstToolFor(text) {
  const t = String(text ?? '').trim();
  if (!t || SMALLTALK.test(t)) return null;
  return detectCalculation(t) ? 'solver' : 'searchKnowledge';
}
