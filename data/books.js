// Book ingestion: whole books (clean PDFs or scanned ones with OCR errors) -> entries for the knowledge library.
//
//   page text -> line cleaning (margin junk, hyphenation) -> OCR repair -> sections by real headings
//             -> chunks of about 1000 characters -> quality filter (tables and noise are dropped) -> entries
//
// Used by ingest.js for any file marked "layout": "book" in data/raw/sources.json ("ocr": true for scans).
// Everything here is plain code (no AI): the same book always gives the same entries.

const MAX_CHUNK = 1000;

// ---------- small helpers ----------

// Edit distance, giving up as soon as it is certain to exceed `max`.
export function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// "QUADRATIC EQUATIONS" -> "Quadratic Equations"; small words stay lower case except at the start or after a colon.
const titleCase = (s) =>
  s
    .toLowerCase()
    .replace(/(^|[\s(›-])([a-z])/g, (_, p, c) => p + c.toUpperCase())
    .replace(/(?<!^)(?<![:›]\s)\b(Of|And|The|In|For|To|By|On|Or|A|An)\b/g, (w) => w.toLowerCase());

// ---------- the Sanskrit names that matter ----------

// The sixteen sutras, their corollaries and the common technical words, spelled correctly. A scan turns "Nikhilam" into
// "Nikhilap" or "Nikhdlatn"; a rare capitalised word that is close to one of these is corrected to it.
export const SANSKRIT = [
  'ekadhikena', 'purvena', 'nikhilam', 'navatascaramam', 'dasatah', 'urdhva', 'tiryagbhyam', 'paravartya', 'yojayet', 'sunyam',
  'samyasamuccaye', 'anurupye', 'sunyamanyat', 'sankalana', 'vyavakalanabhyam', 'puranapuranabhyam', 'calana', 'kalanabhyam',
  'yavadunam', 'tavadunam', 'vyastisamastih', 'sesanyankena', 'caramena', 'sopantyadvayamantyam', 'ekanyunena', 'gunitasamuccayah',
  'gunakasamuccayah', 'antyayoh', 'dasake', 'antyayoreva', 'adyamadyenantyamantyena', 'lopanasthapanabhyam', 'vilokanam',
  'anurupyena', 'vargamula', 'samuccaya', 'atharvaveda', 'baudhayana', 'apastamba', 'katyayana', 'aryabhata', 'brahmagupta',
  'bhaskaracharya', 'varahamihira', 'sulbasutra', 'shulba', 'lilavati', 'bijaganita', 'siddhanta', 'ganita',
];

// Every way a scan spells "Sutra": Siitra, Sfitra, Satra, Stitra, Szltra, Sctra, SBtra...
const SUTRA = /\bS[iufzZBlLctaCG~]{1,3}tra(s?)\b/g;
export const fixSutra = (s) => s.replace(SUTRA, (_, plural) => `Sutra${plural}`).replace(/\bsiitra(s?)\b/g, (_, p) => `sutra${p}`);

// ---------- cleaning one page ----------

// Words an OCR line can hold, for deciding whether the part after a tab is real text or a margin number.
const realWords = (s) => s.split(/\s+/).filter((w) => /^[A-Za-z]{3,}$/.test(w)).length;

export function cleanPageLine(raw, { ocr }) {
  let line = String(raw).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  if (line.includes('\t')) {
    if (ocr) {
      // A scan puts margin numbers and stray letters after a tab; a second column is a whole line of words.
      const [first, ...rest] = line.split(/\t+/);
      line = [first, ...rest.filter((p) => realWords(p) >= 3)].join(' ');
    } else line = line.replace(/\t+/g, ' '); // justified text uses tabs as spaces
  }
  if (ocr) {
    line = line
      .replace(/[~^|#_*<>\\]/g, ' ')
      .replace(/\b(?:[A-Z] ){3,}[A-Z]\b/g, (m) => m.replace(/ /g, '')) // "V E D I C" -> "VEDIC"
      .replace(/^\s*C\s*H\s*A\s*P\s*T\s*E\s*R\b/i, 'CHAPTER');
  }
  line = line.replace(/\[span_\d+\]\((?:start_span|e\s*nd_span)\)/g, '').replace(/\s+/g, ' ').trim();
  if (!line) return '';
  if (/^[(\[]?\d{1,4}[)\]]?$/.test(line) || /^[ivxlc]{1,6}$/i.test(line) || /^-- \d+ of \d+ --$/.test(line)) return ''; // page numbers
  if (/^https?:\/\//i.test(line) || /^www\./i.test(line)) return '';
  if (!/[A-Za-z0-9]/.test(line)) return '';
  // Table debris: a long row of single characters ("1 2 3 4 5 6 7 8 9 0 ..."). A short sum like "23 × 11 = 253" is kept.
  const tokens = line.split(' ');
  if (tokens.length >= 10 && tokens.filter((t) => t.length === 1).length / tokens.length >= 0.85) return '';
  return line;
}

// A line that ends in a hyphen and the next one starts in lower case are one word: "mathe-" + "matics".
export function joinHyphenated(lines) {
  const out = [];
  for (const l of lines) {
    const prev = out.at(-1);
    if (prev && /[a-z]\s?-$/.test(prev.text) && /^[a-z]/.test(l.text)) {
      prev.text = prev.text.replace(/\s?-$/, '') + l.text;
      continue;
    }
    out.push({ ...l });
  }
  return out;
}

// ---------- OCR repair ----------

// Word counts for one book, then: a rare word that is one or two letters away from a common word is a misread
// ("thc" -> "the", "ablc" -> "able"). Capitalised words are left alone (names) unless they are close to a Sanskrit term.
export function buildSpeller(texts) {
  const freq = new Map();
  for (const t of texts) for (const w of t.toLowerCase().match(/[a-z]{3,}/g) ?? []) freq.set(w, (freq.get(w) ?? 0) + 1);
  const byLen = new Map();
  for (const [w, n] of freq) if (n >= 8) (byLen.get(w.length) ?? byLen.set(w.length, []).get(w.length)).push([w, n]);
  const canon = new Set(SANSKRIT);
  const cache = new Map();

  function nearest(word, pool, max) {
    let best = null;
    for (let len = word.length - max; len <= word.length + max; len++) {
      for (const [cand, n] of pool(len)) {
        const d = lev(word, cand, max);
        if (d > max) continue;
        if (!best || d < best.d || (d === best.d && n > best.n)) best = { cand, d, n };
      }
    }
    return best;
  }

  function fix(word) {
    const lower = word.toLowerCase();
    const n = freq.get(lower) ?? 0;
    if (canon.has(lower)) return word;
    if (cache.has(word)) return cache.get(word);
    let out = word;
    const capital = /^[A-Z]/.test(word);
    if (capital && word.length >= 6 && n <= 3) {
      const max = word.length >= 10 ? 3 : word.length >= 7 ? 2 : 1;
      const hit = nearest(lower, () => SANSKRIT.map((w) => [w, 1]), max);
      if (hit && hit.cand[0] === lower[0]) out = hit.cand[0].toUpperCase() + hit.cand.slice(1);
    } else if (!capital && n <= 2 && word === lower) {
      const max = word.length >= 8 ? 2 : 1;
      const hit = nearest(lower, (len) => byLen.get(len) ?? [], max);
      if (hit && hit.n >= 15 * Math.max(n, 1)) out = hit.cand;
    }
    cache.set(word, out);
    return out;
  }
  return { freq, fix };
}

export const repairText = (s, speller) => fixSutra(s).replace(/[A-Za-z]{3,}/g, (w) => speller.fix(w));

// ---------- headings ----------

const roman = /^(?:[IVXLC]{1,8}|[0-9]{1,2})$/;

function isCaps(line) {
  const letters = line.replace(/[^A-Za-z]/g, '');
  if (letters.length < 5 || line.length > 70) return false;
  if (/[.;:,)]$/.test(line) || /\d{2,}/.test(line)) return false;
  const upper = letters.replace(/[^A-Z]/g, '').length;
  const words = line.split(' ').filter((w) => /[A-Za-z]/.test(w));
  return upper / letters.length >= 0.85 && words.length <= 9 && (words.length >= 2 || letters.length >= 8);
}

// "Chapter 3 Eleven Check Method", "1.1 Introduction": a numbered title on one line.
const numbered = (line) => /^Chapter\s+\d+\b.{0,80}$/i.test(line) || /^\d{1,2}(?:\.\d{1,2})+\s+[A-Z][A-Za-z ,&'-]{2,70}$/.test(line);

function plainTitle(line, prev) {
  if (line.length < 8 || line.length > 80 || /[.;:)\]]$/.test(line) || line.includes(',') || /\d/.test(line)) return false;
  const words = line.split(' ');
  if (words.length < 2 || words.length > 10) return false;
  const SMALL = new Set(['of', 'and', 'the', 'in', 'for', 'to', 'on', 'a', 'an', 'with', 'by', 'at', 'or']);
  const sig = words.filter((w) => !SMALL.has(w.toLowerCase()));
  if (!sig.length || sig.filter((w) => /^[A-Z(]/.test(w)).length / sig.length < 0.85) return false;
  return !prev || /[.!?]$/.test(prev);
}

// ---- chapters: find where each chapter starts, using the real titles from the book's contents page ----

export function toRoman(n) {
  let out = '';
  for (const [r, v] of [['L', 50], ['XL', 40], ['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]]) while (n >= v) ((out += r), (n -= v));
  return out;
}
export function fromRoman(str) {
  const map = { I: 1, V: 5, X: 10, L: 50, C: 100 };
  const r = String(str).toUpperCase();
  if (!/^[IVXLC]+$/.test(r)) return NaN;
  let n = 0;
  for (let i = 0; i < r.length; i++) n += map[r[i]] < (map[r[i + 1]] ?? 0) ? -map[r[i]] : map[r[i]];
  return toRoman(n) === r ? n : NaN; // reject "IIII", "VX" and other misreads
}

const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
// Dice similarity of letter pairs: 1 = same, 0 = nothing in common.
export function dice(a, b) {
  const x = norm(a);
  const y = norm(b);
  if (x.length < 3 || y.length < 3) return 0;
  const pairs = (t) => Array.from({ length: t.length - 1 }, (_, i) => t.slice(i, i + 2));
  const px = pairs(x);
  const py = pairs(y);
  const bag = new Map();
  for (const p of py) bag.set(p, (bag.get(p) ?? 0) + 1);
  let hit = 0;
  for (const p of px) {
    if (bag.get(p) > 0) {
      hit++;
      bag.set(p, bag.get(p) - 1);
    }
  }
  return (2 * hit) / (px.length + py.length);
}

// "CHAPTER V", "Chapter I V", "CHAPTER XVII QUADRATIC EQUATIONS": the chapter number, and whatever title follows it.
// A title that starts with I, V or X ("I. Factorisation") must not be swallowed into the numeral, so the numeral is
// the prefix that is a valid number and, when several are, the one that is the next chapter expected.
export function parseChapterLine(text, expectedNext) {
  const m = /^chapter\s*[-–—:]?\s*(.*)$/i.exec(text);
  if (!m) return null;
  const tokens = m[1].split(/\s+/).filter(Boolean);
  const options = [];
  let acc = '';
  for (let i = 0; i < tokens.length && i < 6; i++) {
    if (!/^[IVXLCivxlc]+[.:)]?$/.test(tokens[i]) && !/^\d{1,2}[.:)]?$/.test(tokens[i])) break;
    acc += tokens[i].replace(/[.:)]$/, '');
    const n = /^\d+$/.test(acc) ? Number(acc) : fromRoman(acc);
    if (n >= 1) options.push({ n, rest: tokens.slice(i + 1).join(' ') });
  }
  if (!options.length) return null;
  return options.find((o) => o.n === expectedNext) ?? options[0];
}

// A title, not a sentence or a worked line: no list markers "(iii)", no figures, no colon-dash working.
const headingLike = (t) =>
  t.length >= 8 && t.length <= 80 && /^[(A-Z]/.test(t) && !/[,;:]$/.test(t) && t.split(' ').length <= 10 &&
  !/^\((?:[ivx]+|[a-z]|\d+)\)/i.test(t) && !/\d{2}|:-/.test(t);

// Walk the lines once and find each chapter's first line: [{ index, chapter, skip }] (skip = extra title lines to absorb).
function findChapters(lines, chapters, startPage) {
  const found = [];
  let cur = -1;
  for (let i = 0; i < lines.length; i++) {
    const { text, page } = lines[i];
    if (page < startPage) continue;
    const parsed = parseChapterLine(text, cur + 2);
    if (parsed) {
      const k = parsed.n - 1;
      if (k >= Math.max(cur, 0) && k <= cur + 4 && k < chapters.length && k !== cur) {
        // the title is on this line or the next
        const next = lines[i + 1]?.text ?? '';
        const skip = !parsed.rest && next && next.length < 60 && !/[.]$/.test(next) ? 1 : 0;
        found.push({ index: i, chapter: k, skip });
        cur = k;
        i += skip;
        continue;
      }
    }
    if (!headingLike(text)) continue;
    // a heading that is simply the title of a coming chapter ("DIVISION (by the Nikhilam Method).")
    let best = -1;
    let bestD = 0;
    for (let k = cur + 1; k <= Math.min(chapters.length - 1, cur + 6); k++) {
      const d = dice(text, chapters[k]);
      if (d >= (k === cur + 1 ? 0.6 : 0.85) && d > bestD) ((best = k), (bestD = d));
    }
    if (best >= 0) {
      found.push({ index: i, chapter: best, skip: 0 });
      cur = best;
    }
  }
  return found;
}

// A chapter whose heading is unreadable is placed from the contents page: the printed page where it starts, between the
// chapters that WERE found, converted to a PDF page by proportion, then nudged to the best-matching line nearby.
function fillMissing(found, lines, chapters, printed) {
  if (!printed || found.length < 2) return found;
  const pageAt = (f) => lines[f.index].page;
  const slopes = [];
  for (let a = 0; a < found.length - 1; a++) {
    const dp = printed[found[a + 1].chapter] - printed[found[a].chapter];
    if (dp > 0) slopes.push((pageAt(found[a + 1]) - pageAt(found[a])) / dp);
  }
  const slope = slopes.sort((x, y) => x - y)[Math.floor(slopes.length / 2)] ?? 0.5;
  const has = new Set(found.map((f) => f.chapter));
  const out = [...found];
  for (let j = 0; j < chapters.length; j++) {
    if (has.has(j)) continue;
    const before = [...out].filter((f) => f.chapter < j).sort((x, y) => y.chapter - x.chapter)[0];
    const after = [...out].filter((f) => f.chapter > j).sort((x, y) => x.chapter - y.chapter)[0];
    let est;
    if (before && after) est = pageAt(before) + ((printed[j] - printed[before.chapter]) / (printed[after.chapter] - printed[before.chapter])) * (pageAt(after) - pageAt(before));
    else if (before) est = pageAt(before) + (printed[j] - printed[before.chapter]) * slope;
    else if (after) est = pageAt(after) - (printed[after.chapter] - printed[j]) * slope;
    else continue;
    const lo = (before?.index ?? -1) + 1;
    const hi = after?.index ?? lines.length;
    // the best line for this title within two pages of the estimate, otherwise the first line of the estimated page
    let pick = -1;
    let bestD = 0.45;
    for (let i = lo; i < hi; i++) {
      if (Math.abs(lines[i].page - est) > 2 || !headingLike(lines[i].text)) continue;
      const d = dice(lines[i].text, chapters[j]);
      if (d > bestD) ((pick = i), (bestD = d));
    }
    if (pick < 0) {
      pick = lines.findIndex((l, i) => i >= lo && i < hi && l.page >= Math.floor(est));
      if (pick < 0) continue;
    }
    out.push({ index: pick, chapter: j, skip: 0 });
  }
  return out.sort((x, y) => x.index - y.index);
}

// A heading made of words that really occur in the book (not OCR debris like "Qmot 1 L a").
function sane(heading, freq) {
  const toks = heading.match(/[A-Za-z]+/g) ?? [];
  if (!toks.length || toks.length > 12) return false;
  if (toks.some((t) => t.length === 1 && !/^[AI]$/.test(t))) return false;
  const rare = toks.filter((t) => t.length >= 3 && (freq.get(t.toLowerCase()) ?? 0) < 2).length;
  if (/\b(of|the|and|in|to|by|for|a|an|on|or|with|at|from)$/i.test(heading.trim())) return false; // a title cut off mid-phrase
  return rare / toks.length <= 0.25 && !/[\\/{}$@]/.test(heading);
}

const upperRoman = (s) => s.replace(/\bChapter\s*[-–—]?\s*([IiVvXxLlCc]+)\b/, (_, r) => `Chapter ${r.toUpperCase()}`);

// Split cleaned lines into sections [{ heading, page, text }]. Inside a chapter a sub-heading is named
// "Chapter XVII: Quadratic Equations › First Special Type", so every chunk says where it comes from.
export function sectionise(lines, { fallback, freq = new Map(), chapters = null, chapterPages = null, chapterStartPage = 0 } = {}) {
  const sections = [];
  const starts = new Map();
  if (chapters) for (const f of fillMissing(findChapters(lines, chapters, chapterStartPage), lines, chapters, chapterPages)) starts.set(f.index, f);
  const label = (n) => `Chapter ${toRoman(n + 1)}: ${chapters[n]}`;
  let cur = { heading: `${fallback} · PDF page ${lines[0]?.page ?? ''}`, page: lines[0]?.page ?? null, parts: [] };
  let major = ''; // the current chapter, or the last big heading when the book has no chapter list
  for (let i = 0; i < lines.length; i++) {
    const { text, page } = lines[i];
    const prev = lines[i - 1]?.text ?? '';
    let heading = '';
    let isChapter = false;

    if (starts.has(i)) {
      const f = starts.get(i);
      heading = label(f.chapter);
      isChapter = true;
      i += f.skip;
    } else {
      let cand = '';
      if (isCaps(text) && !roman.test(text) && !/^chapter\b/i.test(text)) {
        cand = text;
        // A title that wraps: "SOME SALIENT, INSTRUCTIVE AND" / "INTERESTING SAMPLE SPECIMENS".
        while (lines[i + 1] && isCaps(lines[i + 1].text) && !/^chapter\b/i.test(lines[i + 1].text) && !starts.has(i + 1) && cand.length < 90) cand += ` ${lines[++i].text}`;
        cand = upperRoman(titleCase(cand));
      } else if (!chapters && /^chapter\s*[-–—:]?\s*(?:[IVXLC]+|\d+)\W*$/i.test(text) && lines[i + 1] && lines[i + 1].text.length < 60 && !/[.]$/.test(lines[i + 1].text)) {
        cand = upperRoman(`${titleCase(text)}: ${titleCase(lines[++i].text)}`);
      } else if (numbered(text)) heading = upperRoman(text); // "Chapter 3 Eleven Check Method", "1.2 Glass": the number makes it certain
      else if (plainTitle(text, prev)) cand = text;
      if (!heading && cand && sane(cand, freq)) heading = cand;
    }

    if (!heading) {
      cur.parts.push(text);
      continue;
    }
    sections.push(cur);
    if (isChapter) major = heading;
    else if (!chapters && heading.split(' ').length >= 3) major = heading;
    const name = !isChapter && major && major !== heading && (chapters || heading.split(' ').length <= 3) ? `${major} › ${heading}` : heading;
    cur = { heading: name, page, parts: [] };
  }
  sections.push(cur);
  return sections.map((x) => ({ heading: x.heading, page: x.page, text: x.parts.join(' ').replace(/\s+/g, ' ').trim() }));
}

// ---------- chunking and quality ----------

function hardSplit(text, max) {
  const out = [];
  let rest = text;
  while (rest.length > max) {
    const cut = rest.lastIndexOf(' ', max);
    out.push(rest.slice(0, cut > max / 2 ? cut : max).trim());
    rest = rest.slice(cut > max / 2 ? cut : max).trim();
  }
  if (rest) out.push(rest);
  return out;
}

// How readable is a chunk? Real prose is full of small function words ("the", "of", "and"); tables, formula debris and
// OCR noise are not. `freq` is the book's word counts: a word seen only once is probably a misread.
const FUNCTION_WORDS = new Set('the of and to in is that a for it as with by on are this be an or from at which can we have has not but its was were these their then also when if each one two all more other such into than so what how'.split(' '));

export function quality(text, freq) {
  const tokens = text.match(/[A-Za-z]+/g) ?? [];
  const words = text.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  const chars = text.length || 1;
  const rare = words.filter((w) => (freq.get(w) ?? 0) <= 1).length;
  const nonProse = (text.match(/[^A-Za-zs.,;:'"()-–—?!]/g) ?? []).length;
  return {
    words: words.length,
    stopRatio: tokens.length ? tokens.filter((t) => FUNCTION_WORDS.has(t.toLowerCase())).length / tokens.length : 0,
    rareRatio: words.length ? rare / words.length : 1,
    nonProse: nonProse / chars,
  };
}

export const isUsable = (q, { min = 20 } = {}) => q.words >= min && q.stopRatio >= 0.2 && q.rareRatio <= 0.4 && q.nonProse <= 0.38;

// ---------- tags ----------

const TOPICS = [
  'vinculum', 'digit sum', 'casting out nines', 'osculator', 'recurring decimal', 'straight division', 'duplex', 'base', 'sub-base',
  'squaring', 'cube root', 'square root', 'factorisation', 'quadratic', 'simultaneous equations', 'divisibility', 'multiplication',
  'division', 'subtraction', 'addition', 'check method', 'eleven check', 'calculus', 'pythagoras', 'conics', 'algebra', 'geometry',
  'metallurgy', 'glass', 'bead', 'ceramics', 'agriculture', 'astronomy', 'mathematics', 'alchemy', 'chemistry', 'medicine', 'surgery',
  'sankhya', 'upanishad', 'harappa', 'iron pillar', 'zero', 'decimal', 'binary', 'sulba', 'yoga', 'ayurveda', 'architecture', 'textile',
];

export function tagsFor(text, base = []) {
  const low = text.toLowerCase();
  const sutras = SANSKRIT.slice(0, 36).filter((w) => new RegExp(`\\b${w}`).test(low));
  const topics = TOPICS.filter((t) => low.includes(t));
  return [...new Set([...base, ...sutras, ...topics])].slice(0, 14);
}

// ---------- the whole book ----------

// pages: [{ num, text }]. helpers: { chunkText, entry } from ingest.js.
export function bookEntries(pages, file, meta, { chunkText, entry }) {
  const ocr = Boolean(meta.ocr);
  const skip = new Set((meta.skipPages ?? []).flatMap((r) => (Array.isArray(r) ? Array.from({ length: r[1] - r[0] + 1 }, (_, i) => r[0] + i) : [r])));

  // 1. lines
  let lines = [];
  for (const p of pages) {
    if (skip.has(p.num)) continue;
    for (const raw of p.text.split('\n')) {
      const text = cleanPageLine(raw, { ocr });
      if (text) lines.push({ text, page: p.num });
    }
  }
  lines = joinHyphenated(lines);

  // 2. OCR repair (a scan only)
  const speller = buildSpeller(lines.map((l) => l.text));
  if (ocr) lines = lines.map((l) => ({ ...l, text: repairText(l.text, speller) }));
  const freq = ocr ? buildSpeller(lines.map((l) => l.text)).freq : speller.freq;

  // 3. sections and chunks
  const sections = sectionise(lines, { fallback: meta.shortTitle ?? meta.title ?? file, freq, chapters: meta.chapters ?? null, chapterPages: meta.chapterPages ?? null, chapterStartPage: meta.chapterStartPage ?? 0 });
  const stats = { sections: sections.length, chunks: 0, kept: 0, dropped: 0, droppedSamples: [], all: process.env.BOOK_DEBUG ? [] : null };
  const entries = [];
  const seen = new Map();
  for (const s of sections) {
    const pieces = (s.text.length > MAX_CHUNK * 1.4 && !/[.!?]\s/.test(s.text) ? hardSplit(s.text, MAX_CHUNK) : chunkText(s.text)).filter((c) => c.length >= 80);
    pieces.forEach((piece, i) => {
      stats.chunks++;
      const q = quality(piece, freq);
      stats.all?.push({ page: s.page, ok: isUsable(q), ...q, text: piece });
      if (!isUsable(q)) {
        stats.dropped++;
        if (stats.droppedSamples.length < 6) stats.droppedSamples.push(`p.${s.page} ${piece.slice(0, 90)}`);
        return;
      }
      stats.kept++;
      let name = pieces.length > 1 ? `${s.heading} (part ${i + 1}/${pieces.length})` : s.heading;
      const n = seen.get(name) ?? 0;
      seen.set(name, n + 1);
      if (n) name = `${name} [PDF page ${s.page}]`; // the same heading twice: tell them apart
      entries.push(
        entry(
          { category: meta.category, provenance: meta.provenance, sourceFile: file, kind: 'book' },
          // tags: only what this chunk is about. Book-wide tags would make every chunk match every generic question.
          { name, meaning: piece, tags: tagsFor(`${s.heading} ${piece}`), source: `${meta.source}, PDF page ${s.page}` }
        )
      );
    });
  }
  return { entries, stats };
}
