// Small text helpers shared by the answer checker (verifier.js) and the claim analyser (claims.js).

export const lower = (s) => String(s ?? '').toLowerCase();

export const STOP = new Set(
  'about above after again also been being between both could does doing during each from have having here into just more most much only other over some such than that their them then there these they this those through under until very were what when where which while will with would your you the and are for how why who can not but was has had its our any all may one two new use used using tell explain describe give say know please make let get want like mean means meant'.split(' ')
);

// Word families that mean the same thing in this domain, so "veda" finds "Vedic", "maths" finds "mathematics", and an
// answer that says "built" or "withstood" is not marked down for not repeating the entry's "erected" or "resisted".
const FAMILIES = [
  ['veda', 'vedic', 'vedas', 'vedanga', 'vedangas'],
  ['math', 'maths', 'mathematics', 'mathematical', 'mathematician'],
  ['ayurveda', 'ayurvedic'],
  ['astronomy', 'astronomical', 'astronomer', 'astronomers'],
  ['multiply', 'multiplication', 'multiplying', 'multiplied', 'product'],
  ['jyotish', 'jyotisha', 'astrology'],
  ['surgery', 'surgical', 'surgeon', 'surgeons'],
  ['metallurgy', 'metallurgical', 'metallurgist', 'metallurgists'],
  ['architecture', 'architectural', 'architect'],
  ['sutra', 'sutras', 'aphorism', 'aphorisms'],
  ['shulba', 'sulba', 'sulbasutra', 'shulbasutra'],
  ['upanishad', 'upanishads'],
  ['purana', 'puranas'],
  ['calendar', 'calendars', 'almanac', 'panchanga'],
  ['construct', 'erect', 'erected', 'built', 'build', 'constructed', 'raised', 'installed', 'founded'],
  ['author', 'composed', 'compose', 'wrote', 'written', 'authored', 'penned', 'compiled'],
  ['corrode', 'corrosion', 'corroded', 'rust', 'rusting', 'rusted', 'oxidation'],
  ['resist', 'resisted', 'resists', 'resistant', 'withstood', 'withstand', 'endured', 'survived'],
  ['scholar', 'scholars', 'researcher', 'researchers', 'historian', 'historians', 'academics'],
  ['treatise', 'text', 'texts', 'manuscript', 'manuscripts', 'scripture', 'scriptures', 'book'],
  ['zero', 'shunya', 'nought', 'cipher'],
  ['invent', 'invented', 'devised', 'devise', 'discovered', 'discover', 'originated', 'pioneered'],
  ['famous', 'renowned', 'celebrated', 'eminent', 'noted'],
  ['calculate', 'compute', 'computed', 'calculated', 'calculation', 'computation'],
  ['deficit', 'deficits', 'deficiency', 'deficiencies', 'shortfall'],
  ['approximate', 'approximation', 'estimate', 'estimated', 'approximately'],
  ['planet', 'planets', 'graha', 'grahas'],
  ['eclipse', 'eclipses', 'grahana'],
  ['medicine', 'medical', 'medicinal', 'remedy', 'remedies', 'therapy'],
];
const ALIAS = Object.fromEntries(FAMILIES.flatMap(([head, ...rest]) => rest.map((w) => [w, head])));
export const stem = (w) => (ALIAS[w] ?? w).replace(/(ing|ies|es|s|ed)$/i, '').slice(0, 6);
// The same families, for generating test paraphrases.
export const synonymFamilies = FAMILIES;

export const words = (s) => lower(s).match(/[\p{L}\p{N}]+/gu) ?? [];
export const contentWords = (s) => words(s).filter((w) => w.length >= 3 && !STOP.has(w));

// "1,00,000" -> "100000"; every whole number written in the text
export const bigNumbers = (text) =>
  [...String(text ?? '').replace(/(\d),(?=\d)/g, '$1').matchAll(/(?<![\d.])\d+(?![\d]*\.\d)/g)].map((m) => m[0]);

// Whole numbers of two or more digits and decimals ("1600", "3.14"), without commas.
export const figuresIn = (text) =>
  [...String(text ?? '').replace(/(\d),(?=\d)/g, '$1').matchAll(/\d+(?:\.\d+)?/g)].map((m) => m[0]).filter((n) => n.includes('.') || n.length >= 2);

export const wordCount = (s) => (String(s).match(/\S+/g) ?? []).length;

const SCRIPTS = {
  devanagari: /[ऀ-ॿ]/gu,
  bengali: /[ঀ-৿]/gu,
  gurmukhi: /[਀-੿]/gu,
  gujarati: /[઀-૿]/gu,
  tamil: /[஀-௿]/gu,
  telugu: /[ఀ-౿]/gu,
  kannada: /[ಀ-೿]/gu,
  malayalam: /[ഀ-ൿ]/gu,
};
export const NON_LATIN_LETTER = /[ऀ-ൿ]/;

// The writing system most of the letters belong to: { name: 'latin' | 'devanagari' | ..., share: 0..1 }
export function scriptOf(text) {
  const t = String(text ?? '');
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  if (!letters) return { name: 'latin', share: 1 };
  let best = { name: 'latin', share: (t.match(/[A-Za-zÀ-ɏ]/g) ?? []).length / letters };
  for (const [name, re] of Object.entries(SCRIPTS)) {
    const share = (t.match(re) ?? []).length / letters;
    if (share > best.share) best = { name, share };
  }
  return best;
}
