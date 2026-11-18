import mongoose from 'mongoose';
import { executeTool } from './tools.js';
import { detectCalculation, SMALLTALK } from './intent.js';
import { searchKnowledge } from './rag.js';
import Knowledge from '../models/Knowledge.js';
import { bigNumbers, contentWords, lower, scriptOf, stem, wordCount } from './textutil.js';
import { analyseClaims, prepareEvidence, prepareWebEvidence, splitSentences, unsupportedYears, unsupportedYearsDetailed } from './claims.js';
import { toEnglishQuery } from './glossary.js';

export { detectCalculation };

// The VedaSutra answer checker. NO AI is involved: every point comes from the project's own systems and plain rules.
//
//   Ground truth   exact solver (arithmetic proven by the code) and the sourced knowledge base (with provenance labels)
//   Rules          provenance wording, no overclaims, health disclaimer, no unsupported specifics, language match
//
// buildGroundTruth(question) is computed ONCE per question; scoreAnswer(truth, answer) is then applied to each
// answer, so every answer is judged against exactly the same evidence. Same input always gives the same score.
//
//   Accuracy 4   facts agree with the solver result or the knowledge-base entry (and nothing invented)
//   Grounding 3  used the right tool and cited its source
//   Honesty 2    provenance wording, no overclaiming, health disclaimer, admits what it does not know
//   Clarity 1    right language and script, plain text (no LaTeX), a complete answer, within the level's length
// Total: 10.

export const MAX = { accuracy: 4, grounding: 3, honesty: 2, clarity: 1 };
export const TIE_MARGIN = 0.5;

const SCOPE_WORDS = /\b(vedic|veda|vedas|vedanga|sutra|sutras|sanskrit|ancient|india|indian|hindu|ayurved\w*|astronom\w*|aryabhat\w*|brahmagupta|bhaskara|varahamihira|sushruta|charaka|vastu|shulba|sulba|nikhilam|urdhva|yavadunam|vinculum|panini|pingala|vimana|iron pillar|zero|decimal|calendar|jyotish\w*|rigveda|upanishad\w*|math(?:s|ematics)?|multipl\w+|square|divis\w+|digit)\b|[ऀ-ॿ஀-௿ఀ-౿ঀ-৿઀-૿ಀ-೿ഀ-ൿ਀-੿]/i;
const HEALTH_Q = /\b(ayurved\w*|medicine|medicinal|bhasma|cure|cures|treat\w*|herb\w*|disease|dosha|health|remed\w+|healing|surgery|sushruta|charaka|drug|therapy)\b/i;

// ---------- ground truth ----------
function evidenceFrom(entry) {
  const body = [entry.name, entry.sanskrit, entry.meaning, entry.whenToUse, ...(entry.examples ?? []), ...(entry.steps ?? [])].join(' ');
  const nameWords = contentWords(`${entry.name} ${entry.sanskrit}`).filter((w) => w.length >= 4);
  const caps = [...String(`${entry.meaning} ${entry.whenToUse}`).matchAll(/(?<![.!?]\s)(?<!^)\b[A-Z][a-z]{3,}\b/g)].map((m) => lower(m[0]));
  const nums = bigNumbers(body);
  const rest = contentWords(entry.meaning).filter((w) => w.length >= 6);
  const keyTerms = [...new Set([...nameWords, ...caps, ...nums, ...rest])].slice(0, 12);
  const prepared = prepareEvidence({ text: body });
  return { name: entry.name, sanskrit: entry.sanskrit, source: entry.source, provenance: entry.provenance, category: entry.category, tags: entry.tags ?? [], text: body, keyTerms, numbers: new Set(nums), figures: prepared.figures, centuries: prepared.centuries, prepared };
}

// Is a retrieved entry really about the question? (The text index can return loose matches.)
// weak = it shares only a word or two with the question: related, but maybe not what was asked.
function relevance(entry, qWords) {
  const head = new Set(contentWords(`${entry.name} ${entry.sanskrit} ${(entry.tags ?? []).join(' ')}`).map(stem));
  const hits = qWords.filter((w) => head.has(stem(w))).length;
  const asked = new Set(qWords.map(stem));
  const nameWords = contentWords(`${entry.name} ${entry.sanskrit}`).map(stem);
  const nameCover = nameWords.length ? nameWords.filter((w) => asked.has(w)).length / nameWords.length : 0;
  if (hits >= 1) return { ok: true, weak: hits < 2 && nameCover < 0.5, nameCover };
  const body = new Set(contentWords(entry.meaning).map(stem));
  if (qWords.filter((w) => body.has(stem(w))).length >= 2) return { ok: true, weak: true, nameCover };
  return { ok: false };
}

// Every source the knowledge base really has, so a citation can be told apart from an invented one.
let sourceCache = { at: 0, list: [] };
async function knownSources(provided) {
  if (provided) return provided;
  if (mongoose.connection.readyState !== 1) return sourceCache.list; // no database connection: do not wait for one
  if (Date.now() - sourceCache.at < 5 * 60 * 1000 && sourceCache.list.length) return sourceCache.list;
  try {
    const list = await Knowledge.distinct('source');
    sourceCache = { at: Date.now(), list: list.map(sourceWordsOf).filter((w) => w.length) };
  } catch {
    /* no database: citations simply cannot be cross-checked */
  }
  return sourceCache.list;
}
const SOURCE_NOISE = new Set(['source', 'sources', 'provenance', 'knowledge', 'base', 'entry', 'text', 'traditional', 'interpretation', 'verified', 'math', 'from', 'section', 'part', 'page', 'verse', 'chapter']);
const sourceWordsOf = (src) => contentWords(src).filter((w) => w.length >= 4 && !SOURCE_NOISE.has(w));
// The text after "Source:" on each line that has one.
// Each cited source on a "Source:" line (several can share a line, split by ; | or "and"), as lists of distinctive words.
const citedSources = (text) =>
  [...String(text).matchAll(/(?:\bsources?|स्रोत|स्त्रोत)\s*[:\-–]\s*([^\n]+)/gi)]
    .flatMap((m) => m[1].split(/\s*(?:[;|•]|\band\b)\s*/i))
    .map(sourceWordsOf)
    .filter((w) => w.length);
// How much of a citation's wording is found in a real source (0 to 1).
const overlapWith = (cited, real) => cited.filter((w) => real.includes(w)).length / cited.length;

// context = earlier user messages (oldest first); used when the question is a follow-up ("what are its types?").
// The same question is often judged again (a rematch, another battle on the same topic), so the ground truth is
// remembered for ten minutes. (Not used when a caller injects its own search or solver, as the tests do.)
const TRUTH_TTL_MS = 10 * 60 * 1000;
const TRUTH_MAX = 200;
const truthCache = new Map();
export const clearTruthCache = () => truthCache.clear();

export async function buildGroundTruth(question, opts = {}) {
  if (opts.search || opts.solve || opts.sources) return computeGroundTruth(question, opts);
  const key = `${String(question ?? '').trim()}\u0000${opts.context?.at?.(-1) ?? ''}`;
  const hit = truthCache.get(key);
  if (hit && Date.now() - hit.at < TRUTH_TTL_MS) return hit.truth;
  const truth = await computeGroundTruth(question, opts);
  truthCache.set(key, { at: Date.now(), truth });
  if (truthCache.size > TRUTH_MAX) truthCache.delete(truthCache.keys().next().value); // oldest first
  return truth;
}

async function computeGroundTruth(question, { context = [], search = searchKnowledge, solve = executeTool, sources } = {}) {
  const q = String(question ?? '').trim();
  const truth = { kind: 'general', checkedAgainst: 'none', question: q, calc: null, evidence: [], needsDisclaimer: HEALTH_Q.test(q), questionScript: scriptOf(q), weak: false, knownSources: [] };

  const calc = detectCalculation(q);
  if (calc) {
    const out = await solve(calc.name, calc.args);
    if (!out.error) {
      truth.kind = 'calculation';
      truth.checkedAgainst = 'exact solver';
      truth.calc = { tool: calc.name, label: calc.label, answer: String(out.answer), method: out.method, quotient: out.quotient, remainder: out.remainder, divisible: out.divisible, args: calc.args };
      return truth;
    }
  }

  if (SMALLTALK.test(q)) return { ...truth, kind: 'smalltalk' };

  const followUp = /\b(it|its|this|that|they|them|those|these)\b/i.test(q) && context.length;
  let query = followUp ? `${q} ${context.at(-1)}` : q;
  // The knowledge base is English: a question in another script is matched through the project glossary.
  const nonLatin = truth.questionScript.name !== 'latin' && truth.questionScript.share >= 0.5;
  if (nonLatin) query = toEnglishQuery(query);
  const qWords = contentWords(query);
  const graded = (query ? await search(query, { limit: 8 }) : []).map((e) => ({ e, r: relevance(e, qWords) })).filter((x) => x.r.ok).sort((a, b) => b.r.nameCover - a.r.nameCover).slice(0, 3); // an entry named after the question comes first
  const found = graded.map((x) => x.e);
  truth.knownSources = await knownSources(sources ? sources.map(sourceWordsOf).filter((w) => w.length) : undefined);
  if (found.length) {
    truth.kind = 'knowledge';
    truth.checkedAgainst = 'knowledge base';
    truth.weak = graded[0].r.weak;
    truth.xlang = nonLatin; // the answer will be in another language than the evidence: only figures, sums and sources can be compared
    truth.evidence = found.map(evidenceFrom);
    truth.needsDisclaimer = truth.needsDisclaimer || found.some((e) => /medic|ayurved|health/i.test(`${e.category} ${(e.tags ?? []).join(' ')}`));
    return truth;
  }
  // Nothing found for a question in another script: its facts cannot be checked (that is not the same as "unknown").
  if (nonLatin) return { ...truth, kind: 'unchecked' };
  truth.kind = SCOPE_WORDS.test(`${q} ${followUp ? context.at(-1) : ''}`) ? 'unknown_topic' : 'offtopic';
  return truth;
}

// ---------- scoring ----------
const ADMITS = /(knowledge base (has|does|doesn'?t|contains|holds)|not in (my|the) knowledge base|couldn'?t find|could not find|can'?t find|no (relevant )?(entry|entries|information|record)|don'?t have (any )?(information|details|a record)|not (something )?i (can|could) (confirm|verify)|i'?m not (sure|certain)|won'?t guess|rather not guess|general knowledge|outside (of )?(the|my) knowledge base|cannot confirm|unable to (find|confirm))|नहीं मिली|नहीं है|जानकारी नहीं/i;
const DECLINES = /(outside (of )?(my|the) (scope|focus|area|expertise)|can only help|only help with|specialise|specialize|focus(ed)? on|within (my )?scope|not able to help|can'?t help with|cannot help with|beyond (my|the) scope|vedic (math|mathematics)|ancient (indian )?science|ancient science)/i;
const ATTRIBUTION = /(according to|traditional(ly)?|text(s)? (say|says|state|states|describe|describes|mention|mentions)|attributed|is said|are said|as per|described in|ancient (text|texts|source|sources)|claims?|credited|the (text|manuscript|treatise))/i;
const INTERPRETATION = /(interpretation|interpret|scholar|reported|suggest(s|ed)?|some (believe|researchers|historians)|modern|secondary|not (settled|proven|confirmed|certain)|debated|disputed|researchers?|speculat|thought to|believed)/i;
const OVERCLAIM = /\b(proven|proved|proves|prove that|unexplained|miracle|miraculous|alien|lost advanced technolog\w*|perfectly accurate|undeniabl\w+|irrefutabl\w+|beyond doubt)\b/i;
// Overclaiming words count only when the answer itself asserts them: "avoid unexplained-miracle claims" or
// "it is not proven" are cautions (the knowledge base itself says such things), not overclaims.
const NEGATORS = /\b(avoid|avoids|not|no|never|without|myth|myths|rather than|don'?t|doesn'?t|isn'?t|aren'?t|cannot|can'?t|unsupported|overstated|debunk\w*|incorrect|false|so-called|alleged|claims? (?:that|of)|beware|caution|misconception|exaggerat\w+|sensational\w*|popular)\b/i;
function findOverclaim(text) {
  for (const sentence of splitSentences(text)) {
    for (const m of sentence.matchAll(new RegExp(OVERCLAIM.source, 'gi'))) {
      if (!NEGATORS.test(sentence.slice(Math.max(0, m.index - 70), m.index))) return m[0];
    }
  }
  return undefined;
}

const DISCLAIMER = /not (a substitute for )?medical advice|educational only/i;
const SOURCE_LINE = /(?:\bsources?|स्रोत|स्त्रोत|ஆதாரம்|మూలం|উৎস|સ્ત્રોત|ಮೂಲ|ഉറവിടം)\s*[:\-–(]/i;

// Words each answer level promises (the prompt says about 120 / 300 / 600; a quarter more is allowed).
export const LENGTH_BUDGET = { brief: 150, balanced: 380, thorough: 750 };

const round1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function criterion(key, label) {
  return { key, label, max: MAX[key], score: 0, notes: [] };
}
// One check: worth `of` points, earns `earned` (all of it when ok, nothing when not, unless a partial amount is given).
const award = (c, of, ok, text, earned = ok ? of : 0) => {
  c.score += earned;
  c.notes.push({ ok, text, points: round1(earned), of });
};

// Does the answer state the solver's result? Handles plain numbers, quotient+remainder, yes/no and vinculum.
function calcMatches(calc, text) {
  const nums = bigNumbers(text);
  if (calc.tool === 'vinculum_convert') {
    const squash = String(text).replace(/[\s*`_]/g, '');
    return squash.includes(calc.answer.replace(/\s/g, ''));
  }
  if (calc.tool === 'check_divisibility') {
    const t = lower(text);
    const negative = /(not|isn'?t|cannot|can'?t|nahi|नहीं)\s+(\w+\s+){0,3}divisible|not divisible|नहीं/.test(t);
    const positive = /\bdivisible\b|\byes\b|हाँ|है/.test(t);
    return calc.divisible ? positive && !negative : negative;
  }
  if (calc.tool === 'vedic_divide_by_9') return nums.includes(calc.quotient) && nums.includes(calc.remainder);
  return nums.includes(calc.answer);
}

// Final claims like "the answer is 9507" that disagree with the solver (and are about as long as it).
// Only explicit answer phrases count: a bare "= 9500" is usually a working step, and written-out sums are
// verified exactly by checkArithmetic instead.
function wrongClaims(calc, text) {
  if (!/^\d+$/.test(calc.answer)) return [];
  const flat = String(text).replace(/(\d),(?=\d)/g, '$1');
  const claims = [...flat.matchAll(/\b(?:answer|result|product)\s*(?:is|=|:)\s*\**\s*(\d+)\b|\bequals\s*\**\s*(\d+)\b/gi)].map((m) => m[1] ?? m[2]);
  return [...new Set(claims)].filter((n) => n !== calc.answer && n.length >= Math.max(2, calc.answer.length - 1) && n.length <= calc.answer.length + 1);
}

// Every "a × b = c", "a + b = c", "a − b = c", "a ÷ b = c" and "n² = c" the answer writes out, checked exactly.
// Returns { checked, wrong: ['98 × 97 = 9507 (it is 9506)'] }.
export function checkArithmetic(text) {
  const flat = String(text ?? '').replace(/(\d),(?=\d)/g, '$1');
  let checked = 0;
  const wrong = [];
  const binary = /(?<![\d.\w])(?<![×*÷\/+−–x-]\s*)(\d+)\s*([+−–×*÷\/]|x|-)\s*(\d+)\s*=\s*(\d+)(?!\d|\.\d|\s*(?:[×*÷\/+−–x-]\s*\d|remainder|rem\b|r\s*\d))/gi;
  for (const m of flat.matchAll(binary)) {
    const [a, b, c] = [BigInt(m[1]), BigInt(m[3]), BigInt(m[4])];
    const op = m[2];
    let value;
    if (op === '+') value = a + b;
    else if (/[−–-]/.test(op)) value = a - b;
    else if (/[×*x]/i.test(op)) value = a * b;
    else if (b !== 0n && a % b === 0n) value = a / b;
    else continue; // not an exact division: nothing to check
    checked++;
    if (value !== c) wrong.push(`${m[1]} ${op} ${m[3]} = ${m[4]} (it is ${value})`);
  }
  for (const m of flat.matchAll(/(?<![\d.\w])(\d+)\s*(?:²|\^\s*2)\s*=\s*(\d+)(?!\d|\.\d)/g)) {
    checked++;
    const v = BigInt(m[1]) ** 2n;
    if (v !== BigInt(m[2])) wrong.push(`${m[1]}² = ${m[2]} (it is ${v})`);
  }
  return { checked, wrong: [...new Set(wrong)] };
}

function termFound(term, haystack, haystackWords) {
  if (/^\d+$/.test(term)) return haystack.includes(term);
  return haystackWords.has(stem(term)) || haystack.includes(term);
}

// Dates the answer states that the knowledge base does not hold (a "4th century" entry allows 301 to 400).
const unsupportedSpecifics = unsupportedYears;

// A cited source that does not resemble ANY source in the knowledge base is treated as invented.
function fabricatedCitation(truth, text) {
  if (!truth.knownSources?.length) return false; // cannot cross-check without the list
  return citedSources(text).some((cited) => !truth.knownSources.some((real) => overlapWith(cited, real) >= 0.5));
}

// style (brief | balanced | thorough) is the answer length the chosen level promised; it is checked in Clarity.
export const MAX_ANALYSED_CHARS = 20000;

export function scoreAnswer(truth, answer, { style } = {}) {
  const rawText = String(answer?.text ?? '');
  const oversize = rawText.length > MAX_ANALYSED_CHARS;
  const text = rawText.slice(0, MAX_ANALYSED_CHARS).trim();
  const toolsUsed = answer?.toolsUsed ?? [];
  const solverEntries = answer?.solver ?? [];
  const accuracy = criterion('accuracy', 'Accuracy');
  const grounding = criterion('grounding', 'Grounding');
  const honesty = criterion('honesty', 'Honesty');
  const clarity = criterion('clarity', 'Clarity');
  const lc = lower(text);
  const arithmetic = checkArithmetic(text);
  // Web pages the model really read count as evidence for the figures and sentences that rely on them.
  const webEvidence = prepareWebEvidence(answer?.retrieved);
  const forFigures = webEvidence.length ? { ...truth, evidence: [...truth.evidence, ...webEvidence] } : truth;
  const analysis = text ? analyseClaims(truth, text, checkArithmetic, findOverclaim, webEvidence) : { claims: [], stats: { total: 0, verified: 0, supported: 0, general: 0, flagged: 0 } };
  const flags = { fabricated: false };
  const overclaims = findOverclaim(text);
  const overclaimNote = (strict) => (overclaims ? `Overclaiming wording${strict ? ' for this kind of source' : ''}: "${overclaims}".` : 'No overclaiming wording.');
  // Health topics must end with the "not medical advice" note; it is worth 0.5 of Honesty when needed.
  const needsNote = truth.needsDisclaimer && truth.kind !== 'calculation';
  const disclaimerCheck = () => needsNote && award(honesty, 0.5, DISCLAIMER.test(text), DISCLAIMER.test(text) ? 'Ends with the "Educational only, not medical advice" note that health topics need.' : 'Health topic without the "Educational only, not medical advice" note.');

  if (!text) {
    award(accuracy, 4, false, 'No answer was produced.');
    return finish(truth, [accuracy, grounding, honesty, clarity], { analysis, flags, arithmetic, toolsUsed });
  }

  switch (truth.kind) {
    case 'calculation': {
      const calc = truth.calc;
      const right = calcMatches(calc, text);
      const wrong = wrongClaims(calc, text);
      if (right && !wrong.length) award(accuracy, 4, true, `States the exact result (${calc.answer}) that the Vedic solver computed for ${calc.label}.`);
      else if (right) award(accuracy, 4, false, `Contains the correct result (${calc.answer}) but also states a different one (${wrong.join(', ')}).`, 2);
      else award(accuracy, 4, false, `Does not state the correct result (${calc.answer}) for ${calc.label}.`);

      const used = toolsUsed.some((t) => t === calc.tool);
      award(grounding, 1.5, used, used ? 'Used the exact solver instead of calculating by itself.' : 'Did not call the exact solver for this calculation.');
      const solverRight = solverEntries.some((s) => s.tool === calc.tool && String(s.answer) === calc.answer);
      award(grounding, 1, solverRight, solverRight ? 'Its solver call produced the same result as ours.' : 'Its solver call did not match (or was never made).');
      const technique = /nikhilam|urdhva|ekanyunena|antyayor|yavadunam|sutra|vinculum|running total|digit sum|casting|ends? in 5|ekadhikena|निखिलं|ऊर्ध्व|एकाधिकेन|वैदिक/i.test(text);
      award(grounding, 0.5, technique, technique ? 'Names the Vedic technique used.' : 'Does not name the technique.');

      if (arithmetic.wrong.length) accuracy.score = Math.max(0, accuracy.score - Math.min(2, arithmetic.wrong.length)), accuracy.notes.push({ ok: false, text: `Arithmetic written in the answer is wrong: ${arithmetic.wrong.join('; ')}.`, points: -Math.min(2, arithmetic.wrong.length), of: 0 });
      award(honesty, 1.5, !wrong.length, wrong.length ? 'States a number that disagrees with the solver as if it were the answer.' : 'Makes no claim that the solver contradicts.');
      award(honesty, 0.5, !overclaims, overclaimNote());
      break;
    }

    case 'knowledge': {
      if (truth.xlang) {
        // The question (and so the answer) is in another language than the knowledge base. The wording cannot be compared,
        // but figures, dates, sums, sources and tool use can: those are checked in full, and the facts get a neutral 2.5 of 4.
        const unsupported = unsupportedSpecifics(forFigures, text);
        const conflicts = analysis.claims.filter((c) => c.status === 'conflict' || c.status === 'unsourced').filter((c) => c.figures?.length);
        const cut = Math.min(2.5, arithmetic.wrong.length + unsupported.length * 1.5 + conflicts.filter((c) => !c.figures.every((n) => unsupported.includes(n))).length * 1.5);
        award(accuracy, 4, cut === 0, 'The answer is in a different language from the knowledge base, so only its figures, dates and sums are compared (not the wording).', Math.max(0, 2.5 - cut));
        if (arithmetic.wrong.length) accuracy.notes.push({ ok: false, text: `Arithmetic written in the answer is wrong: ${arithmetic.wrong.join('; ')}.`, points: -arithmetic.wrong.length, of: 0 });
        if (unsupported.length) accuracy.notes.push({ ok: false, text: `Dates that are not in the knowledge base: ${unsupported.join(', ')}.`, points: -unsupported.length * 1.5, of: 0 });
        const usedTool = toolsUsed.includes('searchKnowledge') || toolsUsed.some((t) => /^(vedic_|vinculum_|digit_sum|check_)/.test(t));
        award(grounding, 1.5, usedTool, usedTool ? 'Used the knowledge base or the exact solver.' : 'Did not use the knowledge base or the exact solver.');
        const fake = fabricatedCitation(truth, text);
        if (fake) flags.fabricated = true;
        award(grounding, 1.5, SOURCE_LINE.test(text) && !fake, fake ? 'Cites a source that is not in the knowledge base at all (it looks invented).' : SOURCE_LINE.test(text) ? 'Cites a source.' : 'Does not cite a source.');
        award(honesty, 1, !fake, fake ? 'Invented a source.' : 'No invented sources.');
        award(honesty, 1, !overclaims, overclaimNote());
        break;
      }
      const haystackWords = new Set(contentWords(text).map(stem));
      // An answer faithful to ANY of the relevant entries found is right, so judge it against the entry it matches best
      // (the first one on a tie): the search ranking is not always the exact entry the answer is about.
      const fit = truth.evidence.map((e) => {
        const hits = e.keyTerms.filter((t) => termFound(t, lc, haystackWords));
        return { e, hits, ratio: e.keyTerms.length ? hits.length / e.keyTerms.length : 1 };
      });
      const best = fit.reduce((b, x) => (x.ratio > b.ratio ? x : b), fit[0]);
      const top = best.e;
      const terms = top.keyTerms;
      const hit = best.hits;
      const coverage = best.ratio;
      const covered = clamp(coverage / 0.4, 0, 1) * 4; // 40% of the key facts earns full marks (short answers cannot cover everything)
      const unsupported = unsupportedSpecifics(forFigures, text);
      const general = /general knowledge|outside (of )?(the|my) knowledge base|general context/i.test(text);
      // An invented date is a classic hallucination (1.5 each); a hedged one ("around 400 CE") is the careful way to be approximate (0.6).
      const contradicted = new Set(analysis.claims.filter((c) => c.status === 'conflict').flatMap((c) => c.figures ?? []));
      const penalty = Math.min(3, unsupportedYearsDetailed(forFigures, text).filter((d) => !contradicted.has(d.year)).reduce((sum, d) => sum + (d.hedged ? 0.6 : 1.5), 0) * (general ? 0.5 : 1));
      // A loose match (related entry, not exactly what was asked) must not punish a careful general answer.
      // ... but only if the answer is at least about the question (shares a word with it), so an off-subject reply earns nothing.
      const onTopic = contentWords(truth.question).some((w) => haystackWords.has(stem(w)));
      const floor = truth.weak && !unsupported.length && onTopic ? 2.5 : 0;
      award(accuracy, 4, coverage >= 0.4, `Covers ${hit.length} of ${terms.length} key facts from "${top.name}" in the knowledge base.`, round1(Math.max(covered, floor)));
      if (truth.weak) accuracy.notes.push({ ok: true, text: 'The knowledge base only partly covers this question, so a careful general answer is not marked down.', points: 0, of: 0 });
      // A figure that differs from what the knowledge base says about the very same thing (not already counted above).
      const conflicts = analysis.claims.filter((c) => c.status === 'conflict');
      if (conflicts.length) {
        const cut = Math.min(3, conflicts.length * 1.5);
        accuracy.score -= cut;
        accuracy.notes.push({ ok: false, text: `Contradicts the knowledge base: "${conflicts[0].text.slice(0, 90)}" (${conflicts[0].note}).`, points: -cut, of: 0 });
      }
      // A sentence that gives a different figure from an earlier one about the same thing.
      const selfContradictions = analysis.claims.filter((c) => c.status === 'inconsistent');
      if (selfContradictions.length) {
        const cut = Math.min(2, selfContradictions.length);
        accuracy.score -= cut;
        accuracy.notes.push({ ok: false, text: `Contradicts itself: "${selfContradictions[0].text.slice(0, 90)}" (${selfContradictions[0].note}).`, points: -cut, of: 0 });
      }
      if (unsupported.length) {
        accuracy.score -= penalty;
        accuracy.notes.push({ ok: false, text: `Gives dates that are not in the knowledge base: ${unsupported.join(', ')}${general ? ' (labelled as general knowledge)' : ''}.`, points: -penalty, of: 0 });
      }

      if (arithmetic.wrong.length) {
        const cut = Math.min(2, arithmetic.wrong.length);
        accuracy.score = Math.max(0, accuracy.score - cut);
        accuracy.notes.push({ ok: false, text: `Arithmetic written in the answer is wrong: ${arithmetic.wrong.join('; ')}.`, points: -cut, of: 0 });
      }
      const called = toolsUsed.includes('searchKnowledge');
      award(grounding, 1, called, called ? 'Searched the knowledge base before answering.' : 'Did not search the knowledge base.');
      const hasSourceLine = SOURCE_LINE.test(text);
      const evidenceSources = truth.evidence.map((e) => sourceWordsOf(e.source));
      const sourceMatch = hasSourceLine && citedSources(text).some((cited) => evidenceSources.some((real) => overlapWith(cited, real) >= 0.5));
      if (sourceMatch) award(grounding, 1.5, true, 'Cites the source of the knowledge-base entry.');
      else if (hasSourceLine && fabricatedCitation(truth, text)) flags.fabricated = true, award(grounding, 1.5, false, 'Cites a source that is not in the knowledge base at all (it looks invented).');
      else if (hasSourceLine) award(grounding, 1.5, false, "Has a source line, but it is not the knowledge-base entry's source.", 0.75);
      else award(grounding, 1.5, false, 'Does not cite a source.');
      const named = truth.evidence.some((e) => [e.name, e.sanskrit].filter(Boolean).some((n) => lc.includes(lower(n))));
      award(grounding, 0.5, named, named ? "Uses the entry's own name or Sanskrit term." : "Does not use the entry's name or Sanskrit term.");

      const prov = top.provenance;
      if (truth.weak && !ATTRIBUTION.test(text) && !INTERPRETATION.test(text)) award(honesty, 1, false, 'The closest entry is only loosely related, so its provenance wording is not required; no attribution or hedging was needed.', 1);
      else if (prov === 'traditional_text') award(honesty, 1, ATTRIBUTION.test(text), ATTRIBUTION.test(text) ? 'Attributes the claim to the tradition or text ("according to…"), as the entry is traditional.' : 'Entry is a traditional-text claim but the answer states it without attribution.');
      else if (prov === 'interpretation') award(honesty, 1, INTERPRETATION.test(text), INTERPRETATION.test(text) ? 'Presents it as an interpretation or reported finding.' : 'Entry is an interpretation but the answer presents it as settled.');
      else award(honesty, 1, true, 'Entry is mathematically verifiable, so a plain statement is fine.');
      // The label the answer puts on its source must be the entry's own: calling an interpretation "verified maths" overstates it.
      const stated = /\((?:provenance:\s*)?(verified[ _]math\w*|traditional[ _]text|interpretation)\)|provenance:\s*(verified[ _]math\w*|traditional[ _]text|interpretation)/i.exec(text);
      if (stated) {
        const label = (stated[1] ?? stated[2]).toLowerCase().startsWith('verified') ? 'verified_math' : (stated[1] ?? stated[2]).toLowerCase().startsWith('traditional') ? 'traditional_text' : 'interpretation';
        if (!truth.evidence.some((e) => e.provenance === label)) {
          const cut = label === 'verified_math' ? 0.5 : 0.25;
          honesty.score -= cut;
          honesty.notes.push({ ok: false, text: `Labels the source "${(stated[1] ?? stated[2]).toLowerCase()}" but the knowledge-base entry is ${prov.replace('_', ' ')}${label === 'verified_math' ? ': that overstates how certain it is' : ''}.`, points: -cut, of: 0 });
        }
      }
      const overclaimed = prov !== 'verified_math' && overclaims;
      award(honesty, needsNote ? 0.5 : 1, !overclaimed, overclaimed ? overclaimNote(true) : overclaimNote());
      disclaimerCheck();
      break;
    }

    case 'unknown_topic': {
      const admits = ADMITS.test(text);
      const unsupported = unsupportedSpecifics(forFigures, text);
      const fakeSource = SOURCE_LINE.test(text) && (!admits || fabricatedCitation(truth, text));
      if (fakeSource) flags.fabricated = true;
      if (admits && !unsupported.length) award(accuracy, 4, true, 'Honestly says the knowledge base has nothing on this and does not invent facts.');
      else if (admits) award(accuracy, 4, false, `Admits the gap but still gives unsupported dates (${unsupported.join(', ')}).`, 2);
      else if (!unsupported.length) award(accuracy, 4, false, 'The knowledge base has nothing on this, but the answer does not say so.', 1.5);
      else award(accuracy, 4, false, `Gives dates the knowledge base does not hold (${unsupported.join(', ')}) without saying so.`);
      const called = toolsUsed.includes('searchKnowledge');
      award(grounding, 1.5, called, called ? 'Searched the knowledge base first.' : 'Did not search the knowledge base.');
      award(grounding, 1.5, !fakeSource, fakeSource ? 'Cites a source for something the knowledge base does not hold.' : 'Does not fabricate a citation.');
      award(honesty, needsNote ? 1 : 1.5, admits, admits ? 'Says what it does not know.' : 'Does not say what it does not know.');
      award(honesty, 0.5, !overclaims, overclaimNote());
      disclaimerCheck();
      break;
    }

    case 'unchecked': {
      accuracy.skipped = true;
      accuracy.notes.push({ ok: true, text: 'This question is not in English, so our (English) knowledge base cannot check its facts. Accuracy is not scored; the other three parts are scaled to 10.', points: 0, of: 0 });
      const called = toolsUsed.includes('searchKnowledge') || toolsUsed.some((t) => /^(vedic_|vinculum_|digit_sum|check_)/.test(t));
      award(grounding, 1.5, called, called ? 'Used the knowledge base or the exact solver.' : 'Did not use the knowledge base or the exact solver.');
      award(grounding, 1.5, SOURCE_LINE.test(text), SOURCE_LINE.test(text) ? 'Cites a source.' : 'Does not cite a source.');
      award(honesty, 2, !overclaims, overclaimNote());
      break;
    }

    case 'offtopic': {
      const declines = DECLINES.test(text) && wordCount(text) <= 90;
      award(accuracy, 4, declines, declines ? 'Politely keeps to Vedic maths and ancient science.' : 'Off-topic question: should politely decline and redirect.');
      award(grounding, 3, !SOURCE_LINE.test(text), SOURCE_LINE.test(text) ? 'Cites sources for an off-topic question.' : 'No made-up sources.');
      award(honesty, 2, !overclaims, overclaimNote());
      break;
    }

    default: {
      // greetings: nothing to check against, so only friendliness, no invented sources, no overclaiming
      const brief = wordCount(text) <= 80;
      award(accuracy, 4, brief, brief ? 'Friendly and to the point.' : 'Too long for a greeting.');
      award(grounding, 3, !SOURCE_LINE.test(text), 'No made-up sources.');
      award(honesty, 2, !overclaims, overclaimNote());
    }
  }

  // Clarity (1): language, plain text, complete.
  const ans = scriptOf(text);
  const needScript = truth.questionScript.name !== 'latin' && truth.questionScript.share >= 0.5;
  const languageOk = needScript ? ans.name === truth.questionScript.name && ans.share >= 0.25 : ans.name === 'latin' || ans.share < 0.5;
  award(clarity, 0.4, languageOk, languageOk ? 'Replies in the language of the question.' : 'Does not reply in the language of the question.');
  const latex = /\$[^$\n]+\$|\\frac|\\times|\\cdot|\\\(/.test(text);
  award(clarity, 0.2, !latex, latex ? 'Uses LaTeX, which does not display here.' : 'Plain text and Unicode (no LaTeX).');
  const complete = /[.!?।)\]*`”"'\d]$|\p{Extended_Pictographic}\uFE0F?$/u.test(text) && !/[:,;]$/.test(text);
  award(clarity, 0.2, complete, complete ? 'Ends cleanly.' : 'Looks cut off.');
  if (oversize) clarity.notes.push({ ok: false, text: `Over ${MAX_ANALYSED_CHARS} characters: only the first part was analysed.`, points: 0, of: 0 }), (clarity.score -= 0.2);
  const budget = LENGTH_BUDGET[style];
  const n = wordCount(text);
  if (budget) award(clarity, 0.2, n <= budget, n <= budget ? `Keeps to its level's length (${n} words, limit about ${budget}).` : `Too long for its level: ${n} words, limit about ${budget}.`);
  else clarity.score += 0.2;

  return finish(truth, [accuracy, grounding, honesty, clarity], { analysis, flags, arithmetic, toolsUsed });
}

function finish(truth, parts, extra = {}) {
  const breakdown = parts.map((c) => ({ ...c, score: round1(clamp(c.score, 0, c.max)) }));
  // A part we cannot check is left out, and the rest are scaled so the total is still out of 10.
  const counted = breakdown.filter((c) => !c.skipped);
  const maxCounted = counted.reduce((s, c) => s + c.max, 0);
  const score = round1((counted.reduce((s, c) => s + c.score, 0) / maxCounted) * 10);
  const { analysis, flags } = extra;
  const risk = riskOf(truth, analysis, flags, extra);
  return { score, max: 10, breakdown, evidence: describeTruth(truth), claims: analysis?.claims ?? [], stats: analysis?.stats, risk, seal: sealOf(score, risk, truth) };
}

// How likely is it that this answer contains something invented? Counted from what the checks found.
function riskOf(truth, analysis, flags = {}, extra = {}) {
  const reasons = [];
  const stats = analysis?.stats ?? { flagged: 0 };
  const conflicts = (analysis?.claims ?? []).filter((c) => c.status === 'conflict').length;
  const wrong = (analysis?.claims ?? []).filter((c) => c.status === 'wrong').length;
  const unsourced = (analysis?.claims ?? []).filter((c) => c.status === 'unsourced').length;
  const overclaims = (analysis?.claims ?? []).filter((c) => c.overclaim).length;
  const selfContradictions = (analysis?.claims ?? []).filter((c) => c.status === 'inconsistent').length;
  if (wrong) reasons.push(`${wrong} wrong calculation${wrong > 1 ? 's' : ''} or answer${wrong > 1 ? 's' : ''}`);
  if (conflicts) reasons.push(`${conflicts} claim${conflicts > 1 ? 's' : ''} that contradict the knowledge base`);
  if (flags.fabricated) reasons.push('a cited source that does not exist in the knowledge base');
  if (selfContradictions) reasons.push(`${selfContradictions} sentence${selfContradictions > 1 ? 's' : ''} that contradict the answer itself`);
  if (overclaims) reasons.push(`${overclaims} overclaiming sentence${overclaims > 1 ? 's' : ''} ("proven", "miracle"...)`);
  if (unsourced) reasons.push(`${unsourced} date or figure${unsourced > 1 ? 's' : ''} found nowhere in the knowledge base`);
  const usedNothing = truth.kind === 'knowledge' && !(extra.toolsUsed ?? []).includes('searchKnowledge');
  if (usedNothing) reasons.push('the knowledge base was not consulted');
  const level = wrong || conflicts || flags.fabricated ? 'high' : unsourced || overclaims || selfContradictions || usedNothing ? 'medium' : 'low';
  return { level, reasons, flagged: stats.flagged };
}

// One word for the whole verdict.
function sealOf(score, risk, truth) {
  if (risk.level === 'high') return score >= 5 ? 'shaky' : 'unreliable';
  if (score >= 9 && risk.level === 'low' && truth.checkedAgainst !== 'none') return 'verified';
  if (score >= 7.5) return 'sound';
  return score >= 5 ? 'shaky' : 'unreliable';
}

// What the answer was checked against (shown to the user).
export function describeTruth(truth) {
  return {
    kind: truth.kind,
    checkedAgainst: truth.checkedAgainst,
    calculation: truth.calc ? { label: truth.calc.label, answer: truth.calc.answer, method: truth.calc.method } : null,
    entries: truth.evidence.map((e) => ({ name: e.name, source: e.source, provenance: e.provenance })),
    // How the verdict was reached: exact (the solver proved it), high (a clear knowledge-base match), medium (a loose match),
    // limited (another language: figures and sources only), rules (nothing to check against: scope and manners only).
    confidence: truth.kind === 'calculation' ? 'exact' : truth.kind === 'knowledge' ? (truth.xlang ? 'limited' : truth.weak ? 'medium' : 'high') : truth.kind === 'unchecked' ? 'limited' : 'rules',
    xlang: Boolean(truth.xlang),
  };
}

// Compare two answers that were scored against the same truth. Close scores are a tie.
export function decideWinner(a, b) {
  if (a == null || b == null) return null;
  const diff = round1(a - b);
  return Math.abs(diff) < TIE_MARGIN ? 'tie' : diff > 0 ? 'a' : 'b';
}
