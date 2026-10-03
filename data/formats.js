// Parsers for the specific dataset formats supplied with the project. Each returns knowledge entries.
// Input lines are already cleaned ({ text, page }) by ingest.js.

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const clean = (s) => s.replace(/\s+/g, ' ').trim();
const CAUTION = 'Evaluate its historical importance from the cited sources, not from modern claims.';

function entry(over) {
  return { name: '', sanskrit: '', meaning: '', category: 'general', whenToUse: '', steps: [], examples: [], tags: [], source: '', provenance: 'interpretation', ...over };
}

// Most careful label wins when records of a group disagree.
function provenanceFromSourceType(types) {
  const all = types.map((t) => t.toLowerCase());
  if (all.length && all.every((t) => /arithmetic independently verified|exact arithmetic/.test(t))) return 'verified_math';
  if (all.length && all.every((t) => /primary[ -]text|traditional/.test(t))) return 'traditional_text';
  return 'interpretation';
}

// ---------------------------------------------------------------------------------------------
// "AIKS" training dataset: records like
//   AIKS-00804 | Indian Mathematics | Bhaskara II
//   Q: ...   A: ...   Steps: 1. ...   Source: ...   Source type: ... | Confidence: High
// Arithmetic practice records are skipped (the solver computes those exactly and thousands of them
// would drown real knowledge). Records are grouped by topic and repeated answers are merged.
// ---------------------------------------------------------------------------------------------
export function parseAiks(lines, file) {
  const records = [];
  let cur = null;
  let field = null;
  for (const { text } of lines) {
    if (!text) continue;
    const head = text.match(/^(AIKS-\d+) \| ([^|]+?) \| (.+)$/);
    if (head) {
      cur = { id: head[1], domain: head[2].trim(), topic: head[3].trim(), q: '', a: '', steps: [], source: '', sourceType: '' };
      records.push(cur);
      field = null;
    } else if (!cur) continue;
    else if (/^Q:/.test(text)) [field, cur.q] = ['q', text.slice(2).trim()];
    else if (/^A:/.test(text)) [field, cur.a] = ['a', text.slice(2).trim()];
    else if (/^Steps:/.test(text)) field = 'steps';
    else if (/^Source:/.test(text)) [field, cur.source] = ['source', text.slice(7).trim()];
    else if (/^Source type:/.test(text)) {
      cur.sourceType = (text.match(/^Source type:\s*(.*?)\s*(?:\|\s*Confidence:.*)?$/) ?? [])[1] ?? '';
      field = null;
    } else if (field === 'steps') {
      const m = text.match(/^\d+\.\s*(.*)$/);
      if (m) cur.steps.push(m[1]);
    } else if (field) cur[field] = `${cur[field]} ${text}`.trim();
  }

  const skipDomains = /^(Vedic Mathematics|Dataset Methodology)$/i; // arithmetic -> solver; methodology -> not about the subject
  const groups = new Map();
  for (const r of records) {
    if (skipDomains.test(r.domain)) continue;
    const key = `${r.domain}|${r.topic}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const entries = [];
  for (const [, recs] of groups) {
    const { domain, topic } = recs[0];
    const answers = [...new Set(recs.map((r) => clean(r.a.replace(/\s*Its historical importance should be[^.]*\./i, ''))).filter(Boolean))];
    const questions = [...new Set(recs.map((r) => clean(r.q)).filter((q) => q && !/training-friendly/i.test(q)))];
    const sources = [...new Set(recs.map((r) => clean(r.source)).filter(Boolean))];
    const types = [...new Set(recs.map((r) => clean(r.sourceType)).filter(Boolean))];
    const isCatalogue = /^Source Catalogue$/i.test(domain);
    entries.push(
      entry({
        name: isCatalogue ? `Source: ${topic}` : topic,
        meaning: `${answers.join(' ')}${isCatalogue ? '' : ` ${CAUTION}`}`,
        category: slug(domain),
        whenToUse: `Answers questions such as: ${questions.slice(0, 4).map((q) => `"${q}"`).join('; ')}`.slice(0, 400),
        tags: [...new Set([topic, domain, 'indian science', 'history', isCatalogue ? 'sources' : 'indian mathematics'].map((t) => t.toLowerCase()))],
        source: `${sources.join('; ')} (AIKS training dataset${types.length ? `: ${types.join(' / ')}` : ''})`,
        provenance: provenanceFromSourceType(types),
        sourceFile: file,
      })
    );
  }
  return entries;
}

// ---------------------------------------------------------------------------------------------
// "Starter" dataset: sections 4 and 5 hold knowledge records:
//   IAM-001 — Aryabhata — Aryabhatiya / Topic: ... / Answer/knowledge: ... / Source type: ...
//   AIS-001 — Ancient Indian astronomy / Answer/knowledge: ... / Dataset note: ...
// The arithmetic section, schema and source list are skipped. The dataset notes are kept: they are
// exactly the "don't overclaim" cautions the assistant should repeat.
// ---------------------------------------------------------------------------------------------
export function parseStarter(lines, file) {
  const recs = [];
  let cur = null;
  let field = null;
  for (const { text } of lines) {
    if (!text) continue;
    const head = text.match(/^((?:IAM|AIS)-\d+) — (.+)$/);
    if (head) {
      cur = { id: head[1], title: head[2].trim(), topic: '', knowledge: '', note: '', type: '' };
      recs.push(cur);
      field = null;
    } else if (/^\d+\. [A-Z]/.test(text)) cur = null; // next section heading ends the records
    else if (!cur) continue;
    else if (/^Topic:/.test(text)) [field, cur.topic] = ['topic', text.slice(6).trim()];
    else if (/^Answer\/knowledge:/.test(text)) [field, cur.knowledge] = ['knowledge', text.slice(17).trim()];
    else if (/^Dataset note:/.test(text)) [field, cur.note] = ['note', text.slice(13).trim()];
    else if (/^Source type:/.test(text)) [field, cur.type] = ['type', text.slice(12).trim()];
    else if (/^Confidence:/.test(text)) field = null;
    else if (field) cur[field] = `${cur[field]} ${text}`.trim();
  }

  return recs
    .filter((r) => r.knowledge)
    .map((r) =>
      entry({
        name: r.title,
        meaning: clean(`${r.knowledge}${r.note ? ` Note: ${r.note}` : ''}`),
        category: r.id.startsWith('IAM') ? 'indian-mathematics' : 'indian-science',
        whenToUse: r.topic ? `Topic: ${r.topic}` : '',
        tags: [...new Set([...r.title.split(/\s+—\s+/), 'indian science', 'history'].map((t) => t.toLowerCase()))],
        source: `Vedic Maths & Ancient Indian Science starter dataset (${r.type || 'historical scholarship'})`,
        provenance: provenanceFromSourceType(r.type ? [r.type] : []),
        sourceFile: file,
      })
    );
}

// ---------------------------------------------------------------------------------------------
// Question-bank CSV: id, category, type, difficulty, question, answer, source.
// Exact calculation rows are skipped (the solver answers those). Everything else becomes an entry whose
// name is the question and whose meaning is the reference answer. "Hallucination Trap" rows are the most
// valuable: they carry the correct, source-backed rebuttal of popular myths.
// ---------------------------------------------------------------------------------------------
const QA_PROVENANCE = {
  calculation: 'verified_math',
  'sutra identification': 'traditional_text',
  'ancient science': 'interpretation',
  'hallucination trap': 'interpretation',
};

export function parseQaRows(rows, file) {
  const [header, ...body] = rows;
  const col = Object.fromEntries(header.map((h, i) => [h.trim().toLowerCase(), i]));
  return body
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => ({
      id: r[col.id] ?? '',
      category: (r[col.category] ?? '').trim(),
      type: (r[col.type] ?? '').trim().toLowerCase(),
      question: clean(r[col.question] ?? ''),
      answer: clean(r[col.answer] ?? ''),
      source: clean(r[col.source] ?? ''),
    }))
    .filter((r) => r.question && r.answer && !(r.category.toLowerCase() === 'calculation' && r.type === 'exact'))
    .map((r) => {
      const cat = r.category.toLowerCase();
      const trap = cat === 'hallucination trap';
      return entry({
        name: r.question,
        meaning: trap ? `Common claim fact-check. ${r.answer.replace(/^Trap.s*/i, '')}` : r.answer,
        category: slug(r.category) || 'q-and-a',
        whenToUse: trap ? 'Use when someone asks about this claim or repeats it as fact: give the sourced correction.' : '',
        tags: [...new Set([r.category.toLowerCase(), 'q&a', ...(trap ? ['myth', 'misconception', 'fact check', 'claim'] : [])])],
        source: `${r.source || 'project question bank'} (project question bank ${r.id})`,
        provenance: QA_PROVENANCE[cat] ?? 'interpretation',
        sourceFile: file,
      });
    });
}

// ---------------------------------------------------------------------------------------------
// "Ancient Indian Science detailed" dataset: records like
//   AIS-00005 | Astronomy | Nakshatra
//   Q: ...  A: ...  Elaboration: ...  Source: ...  Type: primary text | Confidence: High
// 1,500 records repeat only ~31 facts under many question phrasings, with AI-training boilerplate sentences
// ("The model should preserve provenance...") appended to some answers. They are merged per topic and the
// boilerplate is dropped. "Dataset Methodology" records are rules for the assistant, not subject knowledge:
// they live in the system prompt (services/prompt.js), not in the knowledge base.
// ---------------------------------------------------------------------------------------------
const META_SENTENCE = /\b(the model should|an ai model|ai model|training data|teach the model)\b/i;
const TEMPLATE_QUESTION = /(ai model|historically careful|in simple words|important in the history|evidence or source is associated|training-friendly)/i;

function sentences(text) {
  return clean(text).match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
}

export function parseAisDetailed(lines, file) {
  const recs = [];
  let cur = null;
  let field = null;
  for (const { text } of lines) {
    if (!text) continue;
    const head = text.match(/^(AIS-\d+) \| ([^|]+?) \| (.+)$/);
    if (head) {
      cur = { domain: head[2].trim(), topic: head[3].trim(), Q: '', A: '', Elaboration: '', Source: '', Type: '' };
      recs.push(cur);
      field = null;
      continue;
    }
    if (!cur) continue;
    const f = text.match(/^(Q|A|Elaboration|Source):\s*(.*)$/);
    if (f) [field, cur[f[1]]] = [f[1], f[2]];
    else if (/^Type:/.test(text)) {
      cur.Type = (text.match(/^Type:\s*(.*?)\s*(?:\|\s*Confidence:.*)?$/) ?? [])[1] ?? '';
      field = null;
    } else if (field) cur[field] = `${cur[field]} ${text}`.trim();
  }

  const groups = new Map();
  for (const r of recs) {
    if (/^Dataset Methodology$/i.test(r.domain)) continue;
    const key = `${r.domain}|${r.topic}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const entries = [];
  for (const [, rs] of groups) {
    const { domain, topic } = rs[0];
    // Keep each distinct real sentence once, in order; drop training-meta and the repeated significance boilerplate.
    const facts = [];
    for (const s of rs.flatMap((r) => [...sentences(r.A), ...sentences(r.Elaboration)])) {
      if (META_SENTENCE.test(s) || /^Its significance should be interpreted/i.test(s)) continue;
      if (!facts.includes(s)) facts.push(s);
    }
    const questions = [...new Set(rs.map((r) => clean(r.Q)).filter((q) => q && !TEMPLATE_QUESTION.test(q)))];
    const sources = [...new Set(rs.map((r) => clean(r.Source)).filter(Boolean))];
    const types = [...new Set(rs.map((r) => clean(r.Type)).filter(Boolean))];
    const medicine = /^Medicine$/i.test(domain);
    entries.push(
      entry({
        name: topic,
        meaning: clean(`${facts.join(' ')}${medicine ? ' This is historical information only, not medical advice or proof of safety or efficacy.' : ''}`),
        category: slug(domain),
        whenToUse: questions.length ? `Answers questions such as: ${questions.slice(0, 4).map((q) => `"${q}"`).join('; ')}`.slice(0, 400) : '',
        tags: [...new Set([topic, domain, 'ancient indian science', 'history', ...(medicine ? ['ayurveda', 'medicine'] : [])].map((t) => t.toLowerCase()))],
        source: `${sources.join('; ')} (Ancient Indian Science dataset: ${types.join(' / ') || 'historical scholarship'})`,
        provenance: provenanceFromSourceType(types),
        sourceFile: file,
      })
    );
  }
  return entries;
}
