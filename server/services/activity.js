// "Show your work": human-readable lines about what the assistant is doing while it answers
// (searching the knowledge base, searching Wikipedia, using the exact solver). Streamed to the browser live and
// saved with the message, so the user can SEE that a search really happened.

const clip = (s, n = 70) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const SOLVER_TEXT = {
  vedic_multiply: (a) => `Multiplying ${a.a} × ${a.b} with the exact Vedic solver`,
  vedic_square: (a) => `Squaring ${a.number} with the exact Vedic solver`,
  vedic_divide_by_9: (a) => `Dividing ${a.number} by 9 the Vedic way`,
  vinculum_convert: (a) => `Converting ${a.number} to vinculum form`,
  vinculum_to_number: () => 'Converting a vinculum number back',
  digit_sum: (a) => `Finding the digit sum of ${a.number}`,
  check_divisibility: (a) => `Testing whether ${a.number} is divisible by ${a.divisor}`,
  check_product_digit_sum: (a) => `Checking ${a.a} × ${a.b} = ${a.claimed_product} by casting out nines`,
};

// What is about to happen: { kind: 'knowledge' | 'web' | 'solver', text }
export function describeCall(name, args = {}) {
  if (name === 'searchKnowledge') return { kind: 'knowledge', text: `Searching the knowledge base for “${clip(args.query)}”` };
  if (name === 'searchWeb') return { kind: 'web', text: `Searching ${args.lang === 'hi' ? 'Hindi ' : ''}Wikipedia for “${clip(args.query)}”` };
  const solver = SOLVER_TEXT[name];
  return { kind: 'solver', text: solver ? solver(args) : `Using the ${name} tool` };
}

// What came back: { text, count, items }
export function describeResult(name, out = {}) {
  if (out.error) return { text: `Could not finish: ${clip(out.error, 90)}`, count: 0, items: [] };
  if (name === 'searchKnowledge') {
    const items = (out.results ?? []).map((r) => r.name);
    const entries = (out.results ?? []).slice(0, 5).map((r) => ({ name: r.name, source: r.source, provenance: r.provenance, category: r.category }));
    return items.length ? { text: `Found ${items.length} ${items.length === 1 ? 'entry' : 'entries'}: ${items.slice(0, 3).map((n) => clip(n, 40)).join(', ')}`, count: items.length, items, entries } : { text: 'Nothing relevant in the knowledge base', count: 0, items: [] };
  }
  if (name === 'searchWeb') {
    const items = (out.results ?? []).map((r) => r.title);
    const pages = (out.results ?? []).slice(0, 5).map((r) => ({ title: r.title, url: r.url }));
    return items.length ? { text: `Read ${items.length} Wikipedia ${items.length === 1 ? 'page' : 'pages'}: ${items.slice(0, 3).map((n) => clip(n, 40)).join(', ')}`, count: items.length, items, pages } : { text: out.note ? clip(out.note, 90) : 'No Wikipedia page matched', count: 0, items: [] };
  }
  return { text: `${out.method ?? 'Result'}: ${out.answer ?? ''}`.trim(), count: 1, items: [] };
}
