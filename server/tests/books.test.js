import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDb } from './helpers.js';
import {
  lev, toRoman, fromRoman, dice, fixSutra, cleanPageLine, joinHyphenated, buildSpeller, repairText, parseChapterLine, quality, isUsable,
  tagsFor, sectionise, bookEntries,
} from '../../data/books.js';
import { chunkText, entriesForFile, loadSidecar } from '../../data/ingest.js';
import { focus } from '../services/rag.js';

const RAW = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data/raw');
const entry = (base, over) => ({ name: '', sanskrit: '', meaning: '', category: 'general', whenToUse: '', steps: [], examples: [], tags: [], source: '', provenance: 'interpretation', ...base, ...over });

describe('books: small helpers', () => {
  it('measures edit distance and stops early', () => {
    expect(lev('thc', 'the', 2)).toBe(1);
    expect(lev('nikhilap', 'nikhilam', 2)).toBe(1);
    expect(lev('abc', 'xyzxyz', 2)).toBeGreaterThan(2);
  });
  it('reads and writes Roman numerals, rejecting misreads', () => {
    expect(toRoman(17)).toBe('XVII');
    expect(toRoman(40)).toBe('XL');
    expect(fromRoman('xxxix')).toBe(39);
    expect(fromRoman('IIII')).toBeNaN();
    expect(fromRoman('VX')).toBeNaN();
    expect(fromRoman('hello')).toBeNaN();
  });
  it('compares titles by letter pairs', () => {
    expect(dice('DIVISION (bg the Nikhilam Method).', 'Division by the Nikhilam Method')).toBeGreaterThan(0.8);
    expect(dice('Quadratic Equations', 'Cubic Equations')).toBeLessThan(0.8);
    expect(dice('ab', 'ab')).toBe(0);
  });
  it('puts every scanned spelling of Sutra right', () => {
    for (const bad of ['Siitra', 'Sfitra', 'Satra', 'Stitra', 'Szltra', 'Sctra', 'SBtras', 'Sfitras', 'SCitras', 'SGtra']) expect(fixSutra(`the ${bad} here`)).toMatch(/Sutras? here/);
    expect(fixSutra('the Spectra of light')).toBe('the Spectra of light'); // a real word is left alone
    expect(fixSutra('a Stotra and a Sastra')).toBe('a Stotra and a Sastra'); // real Sanskrit words too
  });
});

describe('books: cleaning a page', () => {
  it('drops margin junk after a tab in a scan, but keeps a second column of real words', () => {
    expect(cleanPageLine('the work was done well \t 1', { ocr: true })).toBe('the work was done well');
    expect(cleanPageLine('first column text here \t second column has real words', { ocr: true })).toBe('first column text here second column has real words');
    expect(cleanPageLine('justified \t text \t line', { ocr: false })).toBe('justified text line');
  });
  it('drops page numbers, links and bare symbols, and closes spaced capitals', () => {
    expect(cleanPageLine('42', { ocr: false })).toBe('');
    expect(cleanPageLine('xiv', { ocr: false })).toBe('');
    expect(cleanPageLine('https://example.org/page', { ocr: false })).toBe('');
    expect(cleanPageLine('~ ^ ~', { ocr: true })).toBe('');
    expect(cleanPageLine('V E D I C MATHEMATICS', { ocr: true })).toBe('VEDIC MATHEMATICS');
    expect(cleanPageLine('C H APT ER XVII', { ocr: true })).toBe('CHAPTER XVII');
  });
  it('joins a word split across lines', () => {
    const out = joinHyphenated([{ text: 'Vedic mathe-', page: 3 }, { text: 'matics is old', page: 3 }, { text: 'well -', page: 3 }, { text: 'Known', page: 3 }]);
    expect(out.map((l) => l.text)).toEqual(['Vedic mathematics is old', 'well -', 'Known']);
  });
});

describe('books: repairing a scan', () => {
  const corpus = [
    'the method is the best way to reach the answer and the rest of the work follows the method '.repeat(10),
    'the answer was able to stand because the method was able to reach it. a thc misreading appears once. Nikhilam is a sutra. '.repeat(1),
  ];
  const speller = buildSpeller(corpus);
  it('turns a rare misread into the common word next to it', () => {
    expect(repairText('reach thc answer', speller)).toBe('reach the answer');
  });
  it('leaves common and unrelated words alone', () => {
    expect(repairText('the method follows', speller)).toBe('the method follows');
    expect(repairText('zebra crossing', speller)).toBe('zebra crossing');
  });
  it('corrects a mangled Sanskrit name to the real one, but not an ordinary capitalised word', () => {
    expect(repairText('The Nikhilap method', speller)).toBe('The Nikhilam method');
    expect(repairText('Urdhva-Tiryagbhyip is next', speller)).toContain('Tiryagbhyam');
    expect(repairText('Bangalore is far', speller)).toBe('Bangalore is far');
  });
});

describe('books: chapters', () => {
  it('reads a chapter number and does not swallow the first letter of the title', () => {
    expect(parseChapterLine('CHAPTER VII I. FACTORISATION', 7)).toMatchObject({ n: 7 });
    expect(parseChapterLine('Chapter I V', 4)).toMatchObject({ n: 4 });
    expect(parseChapterLine('CHAPTER XVII', 17)).toMatchObject({ n: 17, rest: '' });
    expect(parseChapterLine('Chapter 3 Eleven Check Method', 0)).toMatchObject({ n: 3 });
    expect(parseChapterLine('the chapter on squares', 1)).toBeNull();
  });

  const chapters = ['Multiplication', 'Division by the Nikhilam Method', 'Quadratic Equations', 'Cubic Equations', 'Square Roots'];
  const printed = [1, 20, 40, 60, 80];
  const L = (page, text) => ({ page, text });
  const lines = [
    L(5, 'CHAPTER I'), L(5, 'Multiplication'), L(5, 'Multiply two numbers by cross working and carry the tens forward at every step in the process.'),
    L(7, 'The same trick works for three digit numbers as well when the rows are lined up carefully on the page.'),
    // chapter II: its heading is unreadable, so it must be placed from the contents page (printed page 20)
    L(9, 'Some words that belong to the second chapter about dividing numbers close to a power of ten using the base.'),
    L(10, 'The deficiency from the base is written beside each number before the working starts at all.'),
    L(12, 'QUADRATIC EQUATIONS'), L(12, 'A quadratic equation has two roots and each root can be found by the Vedic factor method.'),
    L(14, 'FIRST SPECIAL TYPE'), L(14, 'In this type the middle term is the sum of the two outer terms and the work is very short indeed.'),
    L(16, 'CHAPTER IV'), L(16, 'Cubic Equations'), L(16, 'A cubic has three roots and the same factor method is extended to it with one more step added.'),
  ];
  it('finds every chapter, places a missing one from the contents page, and names sub-headings inside their chapter', () => {
    const freq = new Map(['first', 'special', 'type'].map((w) => [w, 5]));
    const sections = sectionise(lines, { fallback: 'Book', freq, chapters, chapterPages: printed, chapterStartPage: 1 });
    const names = sections.map((s) => s.heading);
    expect(names).toContain('Chapter I: Multiplication');
    expect(names).toContain('Chapter II: Division by the Nikhilam Method'); // placed by interpolation
    expect(names).toContain('Chapter III: Quadratic Equations');
    expect(names).toContain('Chapter III: Quadratic Equations › First Special Type');
    expect(names).toContain('Chapter IV: Cubic Equations');
    // the text of the missing chapter is under its own label, not the chapter before it
    const two = sections.find((s) => s.heading === 'Chapter II: Division by the Nikhilam Method');
    expect(two.text).toMatch(/deficiency from the base/);
    expect(sections.find((s) => s.heading === 'Chapter I: Multiplication').text).not.toMatch(/deficiency/);
  });
  it('does not jump to a chapter that is too far ahead', () => {
    const bad = [L(5, 'CHAPTER I'), L(5, 'Multiplication'), L(5, 'x '.repeat(50)), L(6, 'CHAPTER XL'), L(6, 'Square Roots'), L(6, 'y '.repeat(50))];
    const names = sectionise(bad, { fallback: 'Book', chapters, chapterPages: printed, chapterStartPage: 1 }).map((s) => s.heading);
    expect(names.some((n) => /Chapter XL/.test(n))).toBe(false);
  });
});

describe('books: quality filter', () => {
  const freq = new Map(['the', 'method', 'answer', 'number', 'work', 'digit', 'step', 'write', 'result'].map((w) => [w, 10]));
  const prose = 'In this method the digit of the number is written at the end of the step and the result of the work is the answer to the question that was asked about the number and the digit.';
  it('keeps prose and drops tables, formula debris and noise', () => {
    expect(isUsable(quality(prose, freq))).toBe(true);
    expect(isUsable(quality('(f) GD=558 ; 3bc2=486 :. Re (g) aD=729 ; Ca-729 :. B. 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9', freq))).toBe(false);
    expect(isUsable(quality('Xqzv kwpl jrtn bvcx mnlk zxcv qwer tyui opas dfgh jklz xcvb nmqw ertr tyuy iuoi pasd fghj kzxc', freq))).toBe(false);
    expect(isUsable(quality('too short to matter', freq))).toBe(false);
  });
  it('tags a chunk by what it is about, not by the book', () => {
    const tags = tagsFor('Nikhilam Navatascaramam Dasatah is used for squaring and for the vinculum');
    expect(tags).toEqual(expect.arrayContaining(['nikhilam', 'squaring', 'vinculum']));
    expect(tagsFor('nothing relevant here')).toEqual([]);
  });
});

describe('books: a whole synthetic book', () => {
  const body = (n) => `Sentence number ${n} explains how the method works with the digit and the number and the result of the step in the work. `.repeat(1);
  const pages = [
    { num: 1, text: 'Contents\n1\n2\n' },
    { num: 2, text: ['Chapter 1 Digit Sums', ...Array.from({ length: 14 }, (_, i) => body(i))].join('\n') },
    { num: 3, text: ['Chapter 2 Eleven Check', ...Array.from({ length: 14 }, (_, i) => body(i + 20))].join('\n') },
    { num: 4, text: '1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 = = = + + + 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9' },
    { num: 5, text: ['Chapter 3 Noise', ...Array.from({ length: 6 }, () => 'Xqzv kwpl jrtn bvcx mnlk zxcv qwer tyui opas dfgh jklz xcvb nmqw ertr tyuy iuoi pasd fghj kzxc rtyu.')].join('\n') },
  ];
  const meta = { source: 'Test Book (2020)', provenance: 'interpretation', category: 'indian-mathematics', shortTitle: 'Test Book', skipPages: [1] };
  const { entries, stats } = bookEntries(pages, 'test.pdf', meta, { chunkText, entry });
  it('makes entries with book kind, the book as source, the PDF page, and the right provenance', () => {
    expect(entries.length).toBeGreaterThan(2);
    for (const e of entries) {
      expect(e.kind).toBe('book');
      expect(e.provenance).toBe('interpretation');
      expect(e.source).toMatch(/^Test Book \(2020\), PDF page \d+$/);
      expect(e.sourceFile).toBe('test.pdf');
      expect(e.meaning.length).toBeGreaterThanOrEqual(80);
      expect(e.meaning.length).toBeLessThanOrEqual(1300);
    }
  });
  it('names chunks after their chapter, keeps names unique and drops the number table', () => {
    expect(entries.some((e) => e.name.startsWith('Chapter 1 Digit Sums'))).toBe(true);
    expect(entries.some((e) => e.name.startsWith('Chapter 2 Eleven Check'))).toBe(true);
    expect(new Set(entries.map((e) => e.name)).size).toBe(entries.length);
    expect(entries.every((e) => !/1 2 3 4 5 6 7/.test(e.meaning))).toBe(true);
    expect(stats.dropped).toBeGreaterThan(0);
  });
  it('is deterministic: the same book gives the same entries', () => {
    const again = bookEntries(pages, 'test.pdf', meta, { chunkText, entry }).entries;
    expect(again).toEqual(entries);
  });
});

describe('books: the real Tirthaji scan', () => {
  let list;
  beforeAll(async () => {
    const sidecar = await loadSidecar();
    const file = Object.keys(sidecar).find((k) => k.startsWith('Tirthaji_'));
    list = await entriesForFile(file, await readFile(path.join(RAW, file)), sidecar);
  }, 120000);

  it('locates all 40 chapters, in order, each at a believable page', () => {
    const first = new Map();
    for (const e of list) {
      const m = /^Chapter ([IVXL]+): /.exec(e.name);
      if (m && !first.has(m[1])) first.set(m[1], Number(/PDF page (\d+)/.exec(e.source)[1]));
    }
    expect(first.size).toBe(40);
    const pages = [...first.values()];
    expect(pages).toEqual([...pages].sort((a, b) => a - b));
    expect(first.get('IV')).toBe(56); // "Division by the Nikhilam Method" really starts on PDF page 56
    expect(first.get('XXVI')).toBe(127); // recurring decimals
  });
  it('left out the interleaved two-column pages and the contents page', () => {
    const pages = new Set(list.map((e) => Number(/PDF page (\d+)/.exec(e.source)[1])));
    for (const skipped of [1, 2, 11]) expect(pages.has(skipped)).toBe(false);
  });
  it('is labelled honestly and readable', () => {
    expect(list.length).toBeGreaterThan(300);
    expect(list.every((e) => e.provenance === 'interpretation' && e.kind === 'book')).toBe(true);
    expect(list.some((e) => /Sutra/.test(e.meaning))).toBe(true);
    expect(list.every((e) => !/\b(Siitras?|Sfitras?|Satras?)\b/.test(e.meaning))).toBe(true); // the scan's usual spellings were repaired
  });
});

describe('books: retrieval keeps hand-written entries first and off-topic questions empty', () => {
  let stop, Knowledge, searchKnowledge;
  beforeAll(async () => {
    stop = await startDb();
    ({ default: Knowledge } = await import('../models/Knowledge.js'));
    ({ searchKnowledge } = await import('../services/rag.js'));
    const base = { category: 'indian-mathematics', provenance: 'interpretation', source: 'Test book, PDF page 9', kind: 'book' };
    const chunks = [1, 2, 3, 4, 5].map((i) => ({ ...base, name: `Chapter IX: Squaring (part ${i}/5)`, meaning: `Squaring a number by the duplex method, part ${i}. The duplex of a number is found from its digits and the square follows.`, tags: ['squaring'] }));
    chunks.push({ ...base, name: 'Chapter XI: Cubing', meaning: 'Cubing a number by the anurupya method follows the squaring pattern.', tags: [] });
    chunks.push({ ...base, name: 'Chapter XXVI: Recurring Decimals (part 1/2)', meaning: 'Recurring decimals: the decimal of one nineteenth repeats after eighteen digits, found by the Ekadhika method of dividing step by step.', tags: [] });
    chunks.push({ ...base, name: 'Chapter XX: Finance', meaning: 'The capital was borrowed from local financiers and the glass was sold at the market in the town.', tags: [] });
    await Knowledge.insertMany([
      ...chunks,
      { name: 'Vedic Mathematics (overview)', category: 'overview', provenance: 'traditional_text', source: 'Test', meaning: 'Vedic mathematics is a system of mathematics and a method of calculation with sixteen sutras; the Vedic method is popular.', tags: ['vedic mathematics', 'vedic maths'] },
      { name: 'Squaring (hand-written)', category: 'technique', provenance: 'verified_math', source: 'Test', meaning: 'Squaring a number: use the duplex.', tags: ['squaring'] },
    ]);
    await Knowledge.syncIndexes();
  }, 60000);
  afterAll(() => stop());

  it('never lists more than two chunks of the same section', async () => {
    const hits = await searchKnowledge('squaring a number by the duplex method', { limit: 4 });
    const sections = hits.map((h) => h.name.replace(/ \(part \d+\/\d+\)$/, ''));
    for (const s of new Set(sections)) expect(sections.filter((x) => x === s).length).toBeLessThanOrEqual(2);
    expect(hits.some((h) => h.name === 'Squaring (hand-written)')).toBe(true);
  });
  it('puts the hand-written entry before book chunks that match about as well', async () => {
    const hits = await searchKnowledge('squaring', { limit: 4 });
    expect(hits[0].name).toBe('Squaring (hand-written)');
  });
  it('does not show a weak book match as library knowledge', async () => {
    expect(await searchKnowledge('capital of France')).toEqual([]);
    expect(await searchKnowledge('what is the capital of Japan')).toEqual([]);
  });
  it('lets the specific words of a question lead, not the words every entry shares', async () => {
    const hits = await searchKnowledge('Vedic mathematics method for finding recurring decimal of one nineteenth');
    expect(hits[0].name).toBe('Chapter XXVI: Recurring Decimals (part 1/2)');
  });
  it('still finds a book chunk for a real question', async () => {
    const hits = await searchKnowledge('how to cube a number by the anurupya method');
    expect(hits.some((h) => h.name === 'Chapter XI: Cubing')).toBe(true);
  });
});

describe('retrieval: focusing a question', () => {
  it('drops the words every entry shares when there are at least two specific words', () => {
    const f = focus('Vedic mathematics method for finding recurring decimal of 1/19');
    expect(f).toMatch(/recurring decimal/);
    expect(f).not.toMatch(/vedic|mathematics|method|finding/i);
  });
  it('leaves a question about the subject itself untouched', () => {
    expect(focus('What is Vedic mathematics')).toBe('What is Vedic mathematics');
    expect(focus('history of Indian mathematics')).toBe('history of Indian mathematics');
    expect(focus('Nikhilam')).toBe('Nikhilam');
  });
});
