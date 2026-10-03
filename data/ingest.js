// Knowledge ingestion: data/raw/* -> clean -> chunk -> data/processed/*.json -> MongoDB `knowledge` collection.
//
//   npm run ingest            clean, chunk and load into MongoDB (needs MONGO_URI in server/.env)
//   npm run ingest -- --dry   clean and chunk only; writes data/processed but does not touch the DB
//
// Supported raw files: .json (already structured entries), .md / .txt (split by headings), .pdf (text extracted).
// Files without their own metadata take source / provenance / category / tags from data/raw/sources.json.
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(HERE, 'raw');
const OUT_DIR = path.join(HERE, 'processed');
const PROVENANCE = ['verified_math', 'traditional_text', 'interpretation'];

const MAX_CHUNK = 1000; // characters
const MIN_CHUNK = 80;

// ---------- cleaning ----------

// Turn the LaTeX-ish fragments that PDF extraction leaves behind into readable text.
function delatex(s) {
  const map = {
    times: '×', cdot: '·', pm: '±', approx: '≈', sum: 'Σ', oplus: '⊕', mu: 'µ', quad: ' ', leq: '≤', geq: '≥', log: 'log',
  };
  let out = s;
  for (let i = 0; i < 4; i++) out = out.replace(/\\(?:text|mathcal|mathrm)\{([^{}]*)\}/g, '$1'); // \text{...} -> ...
  out = out
    .replace(/\\pmod\s*\{?([^}\s]*)\}?/g, '(mod $1)')
    .replace(/\\(times|cdot|pm|approx|sum|oplus|mu|quad|leq|geq)/g, (_, name) => map[name]) // known commands, even glued to a letter (\muW)
    .replace(/\\[a-zA-Z]+/g, '') // any other command is dropped
    .replace(/_\{([^{}]*)\}/g, '_$1')
    .replace(/\^\{([^{}]*)\}/g, '^$1');
  return out.replace(/[{}]/g, '');
}

// Clean raw extracted text: drop extraction artefacts, keep real content. Operates on a single line.
export function cleanLine(line) {
  return delatex(
    line
      .replace(/\[span_\d+\]\((?:start_span|e\s*nd_span)\)/g, '') // stray citation markers from the PDF export
      .replace(/^-- \d+ of \d+ --$/, '') // page footers
      .replace(/\t+/g, ' | ')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  )
    .replace(/[  ]+/g, ' ')
    .trim();
}

const SMALL = new Set(['of', 'and', 'the', 'in', 'for', 'to', 'on', 'a', 'an', 'via', 'with', 'vs.', 'vs', 'by', 'at', 'or', '/']);

// Heuristic: a heading is a short title-case line, no sentence punctuation, after a sentence end.
function isHeading(line, prev) {
  if (line.length < 8 || line.length > 100) return false;
  if (/[.;:)\]]$/.test(line) || line.includes('|') || line.includes(',')) return false;
  if (/^[●•\-\d]/.test(line) || /(^|\s)\d/.test(line)) return false; // bullets, table cells like "8×8"
  const words = line.split(' ');
  if (words.length < 3 || words.length > 14) return false;
  const significant = words.filter((w) => !SMALL.has(w.toLowerCase()));
  const capped = significant.filter((w) => /^[A-Z(]/.test(w)).length;
  if (!significant.length || capped / significant.length < 0.7) return false;
  return Boolean(prev) && /[.!?]$/.test(prev); // never the very first line (that is the document title)
}

// Split a list of {text, page} lines into sections [{ heading, text, page }].
export function sectionise(lines, fallbackHeading) {
  const rows = lines.filter((l) => l.text);
  const sections = [];
  let cur = { heading: fallbackHeading, parts: [], page: rows[0]?.page ?? 1 };
  for (let i = 0; i < rows.length; i++) {
    const { text, page } = rows[i];
    const prev = rows[i - 1]?.text ?? '';
    if (isHeading(text, prev)) {
      let heading = text;
      // A heading that wrapped onto a second short line: "... and Digital" / "Signal Processing Datasets".
      const nxt = rows[i + 1]?.text ?? '';
      if (nxt && nxt.length < 45 && !/[.,;:|]$/.test(nxt) && nxt.split(' ').length <= 5 && !isHeading(nxt, text) && /^[A-Z]/.test(rows[i + 2]?.text ?? '')) {
        heading = `${text} ${nxt}`;
        i++;
      }
      sections.push(cur);
      cur = { heading, parts: [], page };
    } else cur.parts.push(text);
  }
  sections.push(cur);
  return sections
    .map((s) => ({ heading: s.heading, page: s.page, text: s.parts.join(' ').replace(/\s+/g, ' ').trim() }))
    .filter((s) => s.text.length >= MIN_CHUNK);
}

// Split long text into pieces of at most MAX_CHUNK characters on sentence boundaries,
// repeating the last sentence of each piece at the start of the next for context.
export function chunkText(text, max = MAX_CHUNK) {
  if (text.length <= max) return [text];
  const sentences = text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  const chunks = [];
  let cur = [];
  let len = 0;
  for (const s of sentences) {
    if (len + s.length > max && cur.length) {
      chunks.push(cur.join(' '));
      const keep = cur.at(-1);
      cur = keep.length < max / 3 ? [keep] : [];
      len = cur.reduce((n, x) => n + x.length, 0);
    }
    cur.push(s);
    len += s.length + 1;
  }
  if (cur.length) chunks.push(cur.join(' '));
  return chunks.filter((c) => c.length >= MIN_CHUNK);
}

// ---------- tagging ----------

const KEYWORDS = [
  'nikhilam', 'urdhva', 'tiryakbhyam', 'tiryagbhyam', 'paravartya', 'sutra', 'multiplier', 'vlsi', 'fpga', 'booth', 'wallace',
  'cryptography', 'rsa', 'montgomery', 'karatsuba', 'fir filter', 'calculus', 'cognitive load', 'pedagog', 'squaring', 'division',
  'power', 'delay', 'transistor', 'finfet', 'education', 'students',
];
function keywordTags(text) {
  const low = text.toLowerCase();
  return KEYWORDS.filter((k) => low.includes(k)).map((k) => (k === 'pedagog' ? 'pedagogy' : k));
}

// ---------- building entries ----------

function entry(base, over) {
  return {
    name: '', sanskrit: '', meaning: '', category: 'general', whenToUse: '', steps: [], examples: [], tags: [], source: '', provenance: 'interpretation',
    ...base,
    ...over,
  };
}

function sectionsToEntries(sections, file, meta) {
  const entries = [];
  for (const s of sections) {
    const pieces = chunkText(s.text);
    pieces.forEach((piece, i) => {
      entries.push(
        entry(
          { category: meta.category, source: meta.source, provenance: meta.provenance, sourceFile: file },
          {
            name: pieces.length > 1 ? `${s.heading} (part ${i + 1}/${pieces.length})` : s.heading,
            meaning: piece,
            tags: [...new Set([...(meta.tags ?? []), ...keywordTags(`${s.heading} ${piece}`)])],
            source: s.page ? `${meta.source}, p. ${s.page}` : meta.source,
          }
        )
      );
    });
  }
  return entries;
}

// ---------- per-format readers ----------

async function readPdfLines(buffer) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const { pages } = await parser.getText();
    const lines = [];
    for (const p of pages) for (const raw of p.text.split('\n')) lines.push({ text: cleanLine(raw), page: p.num });
    return lines;
  } finally {
    await parser.destroy();
  }
}

// Stop at the bibliography: it is URLs, not knowledge.
function dropReferences(lines) {
  const i = lines.findIndex((l) => /^(works cited|references|bibliography)$/i.test(l.text));
  return i === -1 ? lines : lines.slice(0, i);
}

function textToLines(text) {
  return text.split('\n').map((raw) => ({ text: cleanLine(raw), page: null }));
}

function normaliseJsonEntry(raw, file, meta) {
  const arr = (v) => (Array.isArray(v) ? v.map(String).filter(Boolean) : v ? [String(v)] : []);
  const e = entry(
    { sourceFile: file },
    {
      name: String(raw.name ?? '').trim(),
      sanskrit: String(raw.sanskrit ?? ''),
      meaning: String(raw.meaning ?? '').replace(/\s+/g, ' ').trim(),
      category: String(raw.category ?? meta.category ?? 'general'),
      whenToUse: String(raw.whenToUse ?? ''),
      steps: arr(raw.steps),
      examples: arr(raw.examples),
      tags: arr(raw.tags),
      source: String(raw.source ?? meta.source ?? '').trim(),
      provenance: raw.provenance ?? meta.provenance,
    }
  );
  if (!e.name) throw new Error(`${file}: an entry has no name`);
  if (!e.source) throw new Error(`${file}: "${e.name}" has no source`);
  if (!PROVENANCE.includes(e.provenance)) throw new Error(`${file}: "${e.name}" needs provenance to be one of ${PROVENANCE.join(', ')}`);
  return e;
}

// Build entries for one raw file. Exported so tests can run it without a database.
export async function entriesForFile(file, buffer, sidecar = {}) {
  const ext = path.extname(file).toLowerCase();
  const meta = { category: 'general', tags: [], ...sidecar[file] };
  const needsMeta = () => {
    if (!meta.source) meta.source = file;
    if (!PROVENANCE.includes(meta.provenance)) {
      console.warn(`  ! ${file}: no valid provenance in sources.json, defaulting to "interpretation"`);
      meta.provenance = 'interpretation';
    }
  };
  const title = path.basename(file, ext);

  if (ext === '.json') {
    const data = JSON.parse(buffer.toString('utf8'));
    return (Array.isArray(data) ? data : data.entries ?? []).map((r) => normaliseJsonEntry(r, file, meta));
  }
  if (ext === '.pdf') {
    needsMeta();
    const lines = dropReferences(await readPdfLines(buffer));
    return sectionsToEntries(sectionise(lines, title), file, meta);
  }
  if (ext === '.md' || ext === '.txt') {
    needsMeta();
    const lines = textToLines(buffer.toString('utf8').replace(/^#+\s*/gm, ''));
    return sectionsToEntries(sectionise(lines, title), file, meta);
  }
  return null; // unsupported (ignored)
}

// ---------- main ----------

export async function loadSidecar() {
  const p = path.join(RAW_DIR, 'sources.json');
  if (!existsSync(p)) return {};
  const { _comment, ...rest } = JSON.parse(await readFile(p, 'utf8'));
  return rest;
}

async function main() {
  const dry = process.argv.includes('--dry');
  const sidecar = await loadSidecar();
  await mkdir(OUT_DIR, { recursive: true });

  const files = (await readdir(RAW_DIR)).filter((f) => !f.startsWith('.') && f !== 'sources.json');
  const all = [];
  for (const file of files) {
    const entries = await entriesForFile(file, await readFile(path.join(RAW_DIR, file)), sidecar);
    if (entries === null) {
      console.log(`- ${file}: unsupported type, skipped`);
      continue;
    }
    await writeFile(path.join(OUT_DIR, `${path.basename(file, path.extname(file))}.json`), JSON.stringify(entries, null, 2));
    console.log(`- ${file}: ${entries.length} entries`);
    all.push({ file, entries });
  }

  if (dry) return console.log('Dry run: processed files written to data/processed, database untouched.');

  // Load into MongoDB. Entries from each file replace that file's previous entries, so re-running is safe.
  const mongoose = (await import('mongoose')).default;
  const { default: Knowledge } = await import('../server/models/Knowledge.js');
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set (put it in server/.env)');
  await mongoose.connect(process.env.MONGO_URI);
  try {
    for (const { file, entries } of all) {
      await Knowledge.deleteMany({ sourceFile: file });
      if (entries.length) await Knowledge.insertMany(entries);
    }
    await Knowledge.syncIndexes(); // make sure the weighted text index exists
    console.log(`Knowledge collection now has ${await Knowledge.countDocuments()} entries.`);
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
