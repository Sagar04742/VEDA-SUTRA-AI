import { searchKnowledge } from './rag.js';
import * as solver from './solver/index.js';

// Tools exposed to Gemini through function calling.
// Solver tools do the arithmetic deterministically; searchKnowledge reads the knowledge base.

const num = { type: 'string', description: 'A whole number written as digits, e.g. "98". Use a string so large values stay exact.' };

const SOLVER_TOOLS = {
  vedic_multiply: {
    description:
      'Multiply two whole numbers with a Vedic technique and return the answer with numbered steps. Uses Nikhilam when both numbers are near a power of ten, otherwise Urdhva-Tiryagbhyam. ALWAYS call this instead of multiplying yourself.',
    parameters: {
      type: 'object',
      properties: {
        a: num,
        b: num,
        method: { type: 'string', enum: ['auto', 'nikhilam', 'urdhva'], description: 'Optional. Default auto.' },
      },
      required: ['a', 'b'],
    },
    run: ({ a, b, method }) => solver.multiply(a, b, method || 'auto'),
  },
  vedic_square: {
    description:
      'Square a whole number with a Vedic shortcut (numbers ending in 5, or numbers near a power of ten) and return numbered steps. ALWAYS call this instead of squaring yourself.',
    parameters: {
      type: 'object',
      properties: {
        number: num,
        method: { type: 'string', enum: ['auto', 'ends_in_5', 'near_base'], description: 'Optional. Default auto.' },
      },
      required: ['number'],
    },
    run: ({ number, method }) => solver.square(number, method || 'auto'),
  },
  vinculum_convert: {
    description: 'Convert a positive whole number to vinculum form (digits above 5 become barred digits). Returns the digits list where barred digits are negative.',
    parameters: { type: 'object', properties: { number: num }, required: ['number'] },
    run: ({ number }) => solver.toVinculum(number),
  },
  vinculum_to_number: {
    description: 'Convert a vinculum digit list (negative numbers are barred digits, e.g. [1,-3,-2]) back to an ordinary number.',
    parameters: {
      type: 'object',
      properties: { digits: { type: 'array', items: { type: 'integer' }, description: 'Digits from left to right; negative for barred digits.' } },
      required: ['digits'],
    },
    run: ({ digits }) => solver.fromVinculum(digits),
  },
  digit_sum: {
    description: 'Compute the digit sum (digital root / casting out nines) of a whole number with steps.',
    parameters: { type: 'object', properties: { number: num }, required: ['number'] },
    run: ({ number }) => solver.digitSum(number),
  },
  check_divisibility: {
    description: 'Test whether a whole number is divisible by 2 to 11 using the digit rules, with steps.',
    parameters: {
      type: 'object',
      properties: { number: num, divisor: { type: 'integer', description: 'An integer from 2 to 11.' } },
      required: ['number', 'divisor'],
    },
    run: ({ number, divisor }) => solver.divisibility(number, divisor),
  },
  check_product_digit_sum: {
    description: 'Verify a claimed product using the casting-out-nines (digit sum) check.',
    parameters: {
      type: 'object',
      properties: { a: num, b: num, claimed_product: num },
      required: ['a', 'b', 'claimed_product'],
    },
    run: ({ a, b, claimed_product }) => solver.checkProduct(a, b, claimed_product),
  },
};

const SEARCH_TOOL = {
  name: 'searchKnowledge',
  description:
    'Search the knowledge base of Vedic mathematics and ancient science. Use it for ANY question about concepts, sutras, history, techniques or ancient science. The query must be self-contained: resolve pronouns and follow-ups from the conversation, e.g. after a question about Vedic mathematics, "what are the types of it?" becomes "types of Vedic mathematics".',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'A standalone search query with the topic named explicitly.' },
      category: { type: 'string', description: 'Optional category filter.' },
    },
    required: ['query'],
  },
};

export const toolDeclarations = [
  ...Object.entries(SOLVER_TOOLS).map(([name, t]) => ({ name, description: t.description, parametersJsonSchema: t.parameters })),
  SEARCH_TOOL,
];

export const isSolverTool = (name) => name in SOLVER_TOOLS;

// ctx.previousUserMessages: earlier user messages in this chat (oldest first), used as a retrieval fallback.
export async function executeTool(name, args = {}, ctx = {}) {
  if (name === 'searchKnowledge') {
    let results = await searchKnowledge(args.query, { category: args.category });
    // Fallback: if the model's query found nothing, add the previous user topic so follow-ups still resolve.
    if (results.length === 0 && ctx.previousUserMessages?.length) {
      const prev = ctx.previousUserMessages.slice(-2).join(' ');
      results = await searchKnowledge(`${args.query ?? ''} ${prev}`, { category: args.category });
    }
    return results.length
      ? { results }
      : { results: [], note: 'No relevant entries were found in the knowledge base. Tell the user honestly; do not guess.' };
  }

  const tool = SOLVER_TOOLS[name];
  if (!tool) return { error: `Unknown tool: ${name}` };
  try {
    const r = tool.run(args);
    return { method: r.method, answer: r.answer, steps: r.steps, ...(r.digits ? { digits: r.digits } : {}), ...(r.divisible !== undefined ? { divisible: r.divisible } : {}) };
  } catch (e) {
    if (e instanceof solver.SolverError) return { error: e.message };
    throw e;
  }
}
