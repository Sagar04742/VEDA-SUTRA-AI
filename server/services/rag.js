import Knowledge from '../models/Knowledge.js';

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

export async function searchKnowledge(query, { limit = 4, category } = {}) {
  const q = sanitise(query);
  if (!q) return [];

  const filter = { $text: { $search: expand(q) } };
  if (category) filter.category = category;

  const docs = await Knowledge.find(filter, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .lean();

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
