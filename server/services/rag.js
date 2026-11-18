import Knowledge from '../models/Knowledge.js';
import { contentWords } from './textutil.js';

// Retrieval layer. Everything that needs knowledge calls searchKnowledge() only,
// so MongoDB Atlas Vector Search can replace the body of this function later
// without touching the rest of the app.

// "maths" stems to "math" but "mathematics" stems to "mathemat" in Mongo's English stemmer; search for all.
function expand(query) {
  return query.replace(/\bmath(s|ematics)?\b/gi, 'math maths mathematics');
}

// Remove characters that change $text semantics (quotes make phrases, a leading - excludes a term).
function sanitise(query) {
  return String(query ?? '')
    .replace(/["\\]/g, ' ')
    .replace(/(^|\s)-+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

// Words that almost every entry in this library contains. They name the library, not the topic, and MongoDB's text score does
// not weigh rare words higher, so in "Vedic mathematics method for finding recurring decimals" they would drown out
// "recurring decimals". When a question has at least two specific words, search with those alone.
const LIBRARY_WORDS = new Set(['vedic', 'veda', 'vedas', 'math', 'maths', 'mathematics', 'mathematical', 'method', 'methods', 'technique', 'techniques', 'ancient', 'indian', 'indians', 'india', 'find', 'finding', 'using']);
const plain = (w) => w.toLowerCase().replace(/[^a-z]/g, '');
export function focus(query) {
  const words = query.split(' ');
  const specific = words.filter((w) => !LIBRARY_WORDS.has(plain(w)) && contentWords(w).length);
  return specific.length >= 2 ? words.filter((w) => !LIBRARY_WORDS.has(plain(w))).join(' ') : query;
}

// "Chapter III: Multiplication (part 5/8)" -> "Chapter III: Multiplication": the section a chunk of a long text belongs to.
const sectionOf = (name) => name.replace(/ \(part \d+\/\d+\)$/, '').replace(/ \[PDF page \d+\]$/, '');
// A book has many neighbouring chunks about the same thing. At most this many from one section go into one answer, so the
// results cover different places instead of one page repeated.
const PER_SECTION = 2;
// A book is long and mentions everyday words ("capital" in a page about glass-making finance), so a weak text match must
// not be shown as library knowledge. Measured: real questions about the books score 9.8 or more, off-topic ones 3.0 at
// most. (Hand-written entries keep the old behaviour.)
const MIN_BOOK_SCORE = 4;
const BOOK_WEIGHT = 0.8; // a book chunk must score about a quarter higher than a curated entry to be placed above it

export async function searchKnowledge(query, { limit = 4, category } = {}) {
  const q = sanitise(query);
  if (!q) return [];

  const filter = { $text: { $search: expand(focus(q)) } };
  if (category) filter.category = category;

  const found = await Knowledge.find(filter, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit * 4)
    .lean();
  // A hand-written entry that matches about as well as a page of a book comes first: it is shorter, checked and sourced.
  const rank = (d) => d.score * (d.kind === 'book' ? BOOK_WEIGHT : 1);
  found.sort((a, b) => rank(b) - rank(a));
  const perSection = new Map();
  const docs = [];
  for (const d of found) {
    if (d.kind === 'book' && d.score < MIN_BOOK_SCORE) continue;
    const section = sectionOf(d.name);
    const n = perSection.get(section) ?? 0;
    if (n >= PER_SECTION) continue;
    perSection.set(section, n + 1);
    docs.push(d);
    if (docs.length === limit) break;
  }

  return docs.map((d) => ({
    id: String(d._id),
    name: d.name,
    sanskrit: d.sanskrit,
    meaning: d.meaning.length > 1500 ? `${d.meaning.slice(0, 1500)}…` : d.meaning,
    category: d.category,
    whenToUse: d.whenToUse,
    steps: d.steps,
    examples: d.examples.slice(0, 3),
    tags: d.tags,
    source: d.source,
    provenance: d.provenance,
    score: Number(d.score.toFixed(2)),
  }));
}
