import { bigNumbers, contentWords, figuresIn, lower, stem, STOP, words } from './textutil.js';

// Claim-level checking ("Pramana X-ray"): the answer is cut into sentences and EACH sentence is checked on its own,
// with plain rules and the project's own data (the exact solver and the sourced knowledge base). No AI.
//
//   verified     a sum that is exactly right, or the solver's result
//   supported    says what a knowledge-base entry says (most of its content words are in that entry)
//   general      not in the knowledge base, and nothing in it can be checked (neither praised nor blamed)
//   conflict     about the same thing as a knowledge-base sentence but with a different number
//   unsourced    a date or figure that appears nowhere in the knowledge base
//   overclaim    states something as proven/miraculous that the sources only attribute or interpret
//   wrong        wrong arithmetic, or a final answer that disagrees with the solver
//   meta         greetings, questions back to the user, source lines, disclaimers (not judged)

export function splitSentences(text) {
  const cleaned = String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, '')
    .replace(/[*_`>|]/g, ' ')
    .replace(/[ \t]+/g, ' ');
  return cleaned
    .split(/(?<=[.!?।])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const META = /^(source|sources|provenance|note)\b\s*[:\-]|educational only|not medical advice|^(namaste|hello|hi|welcome|great question|happy to|glad to|let me know|feel free|would you like|shall we|i hope|do you want|want to|thanks)\b/i;
const isMeta = (s) => /\?\s*\P{L}*$/u.test(s) || META.test(s) || (contentWords(s).length < 3 && !/\d/.test(s));

// "4th century CE" in the evidence allows any year from 301 to 400 (and BCE the other way round).
function centuryRanges(text) {
  const out = [];
  for (const m of String(text).matchAll(/(\d{1,2})(?:st|nd|rd|th)\s+century(?:\s+(BCE|BC|CE|AD))?/gi)) {
    const n = Number(m[1]);
    out.push(/^(BCE|BC)$/i.test(m[2] ?? '') ? [-n * 100, -(n - 1) * 100 - 1] : [(n - 1) * 100 + 1, n * 100]);
  }
  return out;
}

// Is this number written somewhere in the evidence (or, for a year, inside a century the evidence names)?
export function figureAllowed(figure, truth) {
  const q = new Set(figuresIn(truth.question));
  if (q.has(figure)) return true;
  for (const e of truth.evidence ?? []) {
    if (e.figures?.has(figure) || e.numbers?.has(figure)) return true;
    if (/^\d{3,4}$/.test(figure) && (e.centuries ?? []).some(([lo, hi]) => Number(figure) >= lo && Number(figure) <= hi)) return true;
  }
  return false;
}

// Negating words (also "avoid", "myth", "unsupported"...). What matters is WHAT is negated: "an interpretation, not settled
// fact" is a hedge, but "did not resist corrosion" denies something the knowledge base asserts.
const NEG_WORDS = new Set(['not', 'no', 'never', 'neither', 'nor', 'cannot', 'without', 'avoid', 'avoids', 'lack', 'lacks', 'unsupported', 'overstated', 'myth', 'myths', 'false', 'incorrect', 'disputed']);
// The (stemmed) content words that sit within four words after a negating word.
export function negatedStems(text) {
  const tokens = words(String(text).replace(/n['\u2019]t\b/gi, ' not'));
  const out = new Set();
  tokens.forEach((t, i) => {
    if (!NEG_WORDS.has(t)) return;
    for (const w of tokens.slice(i + 1, i + 5)) if (w.length >= 3 && !STOP.has(w)) out.add(stem(w));
  });
  return out;
}

// Each sentence on its own AND each pair of neighbours, because an answer often joins two facts into one sentence.
function windowsOf(sentences) {
  const out = [...sentences];
  for (let i = 0; i + 1 < sentences.length; i++) {
    out.push({ text: `${sentences[i].text} ${sentences[i + 1].text}`, negStems: new Set([...sentences[i].negStems, ...sentences[i + 1].negStems]), stems: new Set([...sentences[i].stems, ...sentences[i + 1].stems]), figures: new Set([...sentences[i].figures, ...sentences[i + 1].figures]) });
  }
  return out;
}

// The web pages the model really read become extra evidence for the sentences that rely on them.
export function prepareWebEvidence(retrieved) {
  return (retrieved ?? [])
    .filter((r) => r?.kind === 'web' && r.text)
    .map((r) => ({ name: r.title, source: 'Wikipedia', provenance: 'web', web: true, text: r.text, keyTerms: [], numbers: new Set(bigNumbers(r.text)), ...prepareEvidence({ text: r.text }) }))
    .map((e) => ({ ...e, prepared: { sentences: e.sentences } }));
}

// What the analyser needs from a knowledge-base entry (built once per question).
export function prepareEvidence(entry) {
  const text = entry.text;
  return {
    figures: new Set(figuresIn(text)),
    centuries: centuryRanges(text),
    sentences: windowsOf(splitSentences(text).map((s) => ({ text: s, negStems: negatedStems(s), stems: new Set(contentWords(s).map(stem)), figures: new Set(figuresIn(s)) }))),
  };
}

// Dates such as "in 1337 CE" that appear in no evidence (and are not inside a century the evidence names).
// hedged: the answer itself says "around", "c.", "roughly"...: that is the careful way to give a date (the project's
// own rules ask for approximate dates), so it costs far less than a flat claim.
const HEDGE = /\b(around|about|circa|c\.|approximately|approx|roughly|nearly|almost|some|dating|dated|probably|likely|estimated)\b[^.]{0,25}$/i;
export function unsupportedYearsDetailed(truth, text) {
  const found = new Map();
  const t = String(text);
  for (const m of t.matchAll(/\b(\d{3,4})\s*(?:BCE|BC|CE|AD)\b|\b(?:in|around|circa|c\.|year)\s+(\d{3,4})\b/gi)) {
    const year = m[1] ?? m[2];
    if (figureAllowed(year, truth)) continue;
    const hedged = HEDGE.test(t.slice(Math.max(0, m.index - 30), m.index + m[0].length - year.length));
    found.set(year, found.has(year) ? found.get(year) && hedged : hedged);
  }
  return [...found].map(([year, hedged]) => ({ year, hedged }));
}
export const unsupportedYears = (truth, text) => unsupportedYearsDetailed(truth, text).map((d) => d.year);

// checkSums(sentence) -> { checked, wrong: [string] } (passed in to avoid a circular import)
export function analyseClaims(baseTruth, text, checkSums, findOverclaim = () => undefined, webEvidence = []) {
  const truth = webEvidence.length ? { ...baseTruth, evidence: [...(baseTruth.evidence ?? []), ...webEvidence] } : baseTruth;
  const claims = [];
  // Overclaiming matters unless the entry is mathematically verifiable (then "proven" can be true).
  const strict = baseTruth.kind === 'unknown_topic' || (baseTruth.kind === 'knowledge' && (baseTruth.evidence ?? []).some((e) => e.provenance !== 'verified_math'));
  const calcAnswer = truth.calc?.answer;

  for (const sentence of splitSentences(text)) {
    if (isMeta(sentence)) {
      claims.push({ text: sentence, status: 'meta' });
      continue;
    }

    const sums = checkSums(sentence);
    if (sums.wrong.length) {
      claims.push({ text: sentence, status: 'wrong', note: `Arithmetic is wrong: ${sums.wrong[0]}`, figures: [] });
      continue;
    }

    if (truth.kind === 'calculation') {
      const flat = sentence.replace(/(\d),(?=\d)/g, '$1');
      const claimed = [...flat.matchAll(/\b(?:answer|result|product)\s*(?:is|=|:)\s*\**\s*(\d+)\b|\bequals\s*\**\s*(\d+)\b/gi)].map((m) => m[1] ?? m[2]);
      if (claimed.some((n) => /^\d+$/.test(calcAnswer ?? '') && n !== calcAnswer && Math.abs(n.length - calcAnswer.length) <= 1)) {
        claims.push({ text: sentence, status: 'wrong', note: `The exact solver says ${calcAnswer}`, figures: claimed });
      } else if (sums.checked > 0 || (calcAnswer && bigNumbers(flat).includes(calcAnswer))) {
        claims.push({ text: sentence, status: 'verified', note: sums.checked > 0 ? 'Every sum in this sentence checks out exactly' : `Matches the exact solver (${calcAnswer})` });
      } else claims.push({ text: sentence, status: 'general' });
      continue;
    }

    if (sums.checked > 0) {
      claims.push({ text: sentence, status: 'verified', note: 'Every sum in this sentence checks out exactly' });
      continue;
    }

    const stems = new Set(contentWords(sentence).map(stem));
    let best = { ratio: 0, shared: 0, sentence: null, entry: null };
    for (const entry of truth.evidence ?? []) {
      for (const es of entry.prepared?.sentences ?? []) {
        let shared = 0;
        for (const w of stems) if (es.stems.has(w)) shared++;
        const ratio = stems.size ? shared / stems.size : 0;
        if (shared >= 2 && ratio > best.ratio) best = { ratio, shared, sentence: es, entry };
      }
    }

    const figures = figuresIn(sentence).filter((f) => !figureAllowed(f, truth));
    // Almost the same words as a knowledge-base sentence, but the opposite polarity ("did not resist" against "resisted").
    const negated = negatedStems(sentence);
    const opposite = best.sentence && best.ratio >= 0.6 && best.shared >= 3 &&
      ([...negated].some((w) => best.sentence.stems.has(w) && !best.sentence.negStems.has(w)) || // it denies what the entry asserts
        [...best.sentence.negStems].some((w) => stems.has(w) && !negated.has(w))); // it asserts what the entry denies
    if (opposite) {
      claims.push({ text: sentence, status: 'conflict', note: `The knowledge base says the opposite (${best.entry.name}): "${best.sentence.text.slice(0, 110)}"`, figures: [], entry: best.entry.name });
      continue;
    }
    if (figures.length && best.sentence && best.ratio >= 0.3 && best.sentence.figures.size) {
      claims.push({ text: sentence, status: 'conflict', note: `The knowledge base says ${[...best.sentence.figures].join(', ')} (${best.entry.name})`, figures, entry: best.entry.name });
    } else if (figures.length && (truth.evidence ?? []).length) {
      claims.push({ text: sentence, status: 'unsourced', note: `${figures.join(', ')} appears nowhere in the knowledge base`, figures });
    } else if (best.sentence && best.ratio >= 0.5 && stems.size >= 3) {
      claims.push(best.entry.web
        ? { text: sentence, status: 'web', note: `Matches the Wikipedia page the model read: ${best.entry.name}`, entry: best.entry.name }
        : { text: sentence, status: 'supported', note: `Matches the knowledge base: ${best.entry.name}`, entry: best.entry.name });
    } else claims.push({ text: sentence, status: 'general' });
  }

  // An overclaiming sentence is flagged on top of whatever else it is (a made-up date that is also called a miracle shows both).
  if (strict) {
    for (const c of claims) {
      const word = c.status === 'meta' || c.status === 'wrong' || c.status === 'verified' ? undefined : findOverclaim(c.text);
      if (!word) continue;
      const note = `Overclaims ("${word}"): the sources do not say this`;
      if (c.status === 'general' || c.status === 'supported') Object.assign(c, { status: 'overclaim', note });
      else c.note = `${c.note}. ${note}`;
      c.overclaim = word;
    }
  }

  // Does the answer disagree with itself? Two sentences about the same thing that give different figures.
  if (truth.kind !== 'calculation') {
    const judged = claims.filter((c) => c.status !== 'meta' && c.status !== 'wrong');
    const info = judged.map((c) => ({ c, stems: new Set(contentWords(c.text).map(stem)), figures: new Set(figuresIn(c.text).filter((f) => f.length >= 2)) }));
    for (let j = 1; j < info.length; j++) {
      if (!info[j].figures.size || info[j].c.status === 'inconsistent') continue;
      for (let i = 0; i < j; i++) {
        if (!info[i].figures.size) continue;
        let shared = 0;
        for (const w of info[j].stems) if (info[i].stems.has(w)) shared++;
        const overlap = shared / Math.max(1, Math.min(info[i].stems.size, info[j].stems.size));
        const disjoint = ![...info[j].figures].some((f) => info[i].figures.has(f));
        if (shared >= 3 && overlap >= 0.5 && disjoint) {
          Object.assign(info[j].c, { status: 'inconsistent', note: `Disagrees with an earlier sentence: ${[...info[j].figures].join(', ')} here, ${[...info[i].figures].join(', ')} before`, figures: [...info[j].figures] });
          break;
        }
      }
    }
  }

  const count = (s) => claims.filter((c) => c.status === s).length;
  const stats = { total: claims.filter((c) => c.status !== 'meta').length, verified: count('verified'), supported: count('supported'), web: count('web'), general: count('general'), flagged: count('conflict') + count('unsourced') + count('wrong') + count('overclaim') + count('inconsistent') };
  return { claims, stats };
}

export const claimsUtil = { lower };
