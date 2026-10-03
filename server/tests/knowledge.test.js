import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startDb } from './helpers.js';
import JSZip from 'jszip';
import { entriesForFile, loadSidecar, cleanLine, chunkText, parseCsv } from '../../data/ingest.js';

const RAW = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../data/raw');
let stop, Knowledge, searchKnowledge, executeTool, entries;

beforeAll(async () => {
  stop = await startDb();
  ({ default: Knowledge } = await import('../models/Knowledge.js'));
  ({ searchKnowledge } = await import('../services/rag.js'));
  ({ executeTool } = await import('../services/tools.js'));

  // Load the real raw data the same way `npm run ingest` does.
  const sidecar = await loadSidecar();
  entries = [];
  for (const file of ['core-vedic-math.json', 'Vedic Mathematics Application Datasets.pdf']) {
    entries.push(...(await entriesForFile(file, await readFile(path.join(RAW, file)), sidecar)));
  }
  await Knowledge.insertMany(entries);
  await Knowledge.syncIndexes();
}, 120000);
afterAll(() => stop());

describe('ingest: cleaning and chunking', () => {
  it('removes extraction artefacts and converts LaTeX to readable text', () => {
    expect(cleanLine('Stratified sampling [span_9](start_span)[span_9](e nd_span)per group')).toBe('Stratified sampling per group');
    expect(cleanLine('-- 3 of 12 --')).toBe('');
    expect(cleanLine('A \\cdot B = (A_H B_H) 2^{N} + \\text{Base} \\pm 1')).toBe('A · B = (A_H B_H) 2^N + Base ± 1');
    expect(cleanLine('P_{\\text{dyn}} = \\alpha C V_{dd}^2 f')).toBe('P_dyn = C V_dd^2 f');
    expect(cleanLine('delay \\mu\\text{W} \\times 2')).toBe('delay µW × 2');
    expect(cleanLine('a\tb')).toBe('a | b');
  });

  it('chunks on sentence boundaries within the size limit', () => {
    const text = Array.from({ length: 40 }, (_, i) => `This is sentence number ${i} about Vedic mathematics.`).join(' ');
    const chunks = chunkText(text, 300);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.length <= 360)).toBe(true);
    expect(chunks.every((c) => /[.]$/.test(c))).toBe(true);
    expect(chunkText('short text', 300)).toEqual(['short text']);
  });

  it('turns the PDF into clean, labelled, page-referenced entries', () => {
    const pdf = entries.filter((e) => e.sourceFile.endsWith('.pdf'));
    expect(pdf.length).toBeGreaterThan(15);
    for (const e of pdf) {
      expect(e.provenance).toBe('interpretation');
      expect(e.category).toBe('research');
      expect(e.source).toMatch(/, p\. \d+$/);
      expect(e.meaning).not.toMatch(/span_\d|\\[a-z]+|-- \d+ of \d+ --/);
      expect(e.meaning.length).toBeLessThanOrEqual(1400);
      expect(e.name.length).toBeGreaterThan(5);
    }
    expect(pdf.some((e) => /Hardware Performance Datasets/.test(e.name))).toBe(true);
    expect(pdf.map((e) => e.meaning).join(' ')).not.toMatch(/Works cited|https?:\/\//); // bibliography dropped
  });

  it('keeps every curated entry valid', () => {
    const curated = entries.filter((e) => e.sourceFile === 'core-vedic-math.json');
    expect(curated.length).toBeGreaterThanOrEqual(24);
    for (const e of curated) {
      expect(['verified_math', 'traditional_text', 'interpretation']).toContain(e.provenance);
      expect(e.source).toBeTruthy();
      expect(e.meaning.length).toBeGreaterThan(30);
    }
    expect(curated.filter((e) => e.category === 'sutra').length).toBeGreaterThanOrEqual(17);
  });

  it('rejects entries with missing source or bad provenance', async () => {
    const bad = (o) => entriesForFile('x.json', Buffer.from(JSON.stringify([o])), {});
    await expect(bad({ name: 'A', provenance: 'verified_math' })).rejects.toThrow(/no source/);
    await expect(bad({ name: 'A', source: 's', provenance: 'made_up' })).rejects.toThrow(/provenance/);
    await expect(bad({ source: 's', provenance: 'verified_math' })).rejects.toThrow(/no name/);
  });
});

describe('ingest: more file types', () => {
  const sidecar = { 'notes.csv': { source: 'My notes', provenance: 'traditional_text' } };

  it('reads CSV rows with quotes, commas and multi-value columns', async () => {
    const csv = ['name,sanskrit,meaning,tags,steps', '"Sutra, test","सूत्र","Says ""hello"", then\nmore",a;b|c,"one|two"', ',,,,', 'Plain,,Second row,,', ''].join('\r\n');
    const out = await entriesForFile('notes.csv', Buffer.from(csv), sidecar);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: 'Sutra, test', sanskrit: 'सूत्र', tags: ['a', 'b', 'c'], steps: ['one', 'two'], source: 'My notes', provenance: 'traditional_text' });
    expect(out[0].meaning).toBe('Says "hello", then more');
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('explains a CSV with missing columns', async () => {
    await expect(entriesForFile('bad.csv', Buffer.from('title,text\nx,y'), {})).rejects.toThrow(/"name" and "meaning"/);
  });

  it('reads a DOCX and splits it by headings', async () => {
    const para = (t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;
    const body = [
      para('Introduction to the Subject'),
      para('This is the opening paragraph of the document and it is long enough to be kept as a chunk of knowledge text.'),
      para('Surya Siddhanta and Astronomy'),
      para('The Surya Siddhanta is an ancient Sanskrit treatise on astronomy that describes planetary motion in detail for readers.'),
    ].join('');
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const out = await entriesForFile('book.docx', buffer, { 'book.docx': { source: 'My book', provenance: 'traditional_text', category: 'astronomy' } });
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out.map((e) => e.meaning).join(' ')).toMatch(/Surya Siddhanta/);
    expect(out.every((e) => e.provenance === 'traditional_text' && e.category === 'astronomy' && e.source === 'My book')).toBe(true);
  });
});

describe('retrieval (searchKnowledge)', () => {
  const top = async (q, n = 1) => (await searchKnowledge(q, { limit: n })).map((r) => r.name);

  it('answers the memory-test questions', async () => {
    expect((await top('What is Vedic math?'))[0]).toMatch(/Vedic Mathematics \(overview\)|sixteen sutras/);
    const types = await top('types of Vedic mathematics', 3);
    expect(types.join(' | ')).toMatch(/overview|sixteen sutras/);
  });

  it('finds techniques by name, Sanskrit and topic', async () => {
    expect((await top('Nikhilam'))[0]).toMatch(/Nikhilam/);
    expect((await top('Urdhva Tiryagbhyam'))[0]).toMatch(/Urdhva/);
    expect((await top('ऊर्ध्वतिर्यग्भ्याम्'))[0]).toMatch(/Urdhva/);
    expect((await top('squares of numbers ending in 5'))[0]).toMatch(/ending in 5|Ekadhikena/);
    expect((await top('casting out nines'))[0]).toMatch(/Digit sum/);
    expect((await top('divisibility by 7'))[0]).toMatch(/Divisibility/);
    expect((await searchKnowledge('Vedic multiplier FPGA power delay'))[0].category).toBe('research');
  });

  it('returns provenance, source and metadata with every result', async () => {
    const [r] = await searchKnowledge('Yavadunam');
    expect(r).toMatchObject({ provenance: 'traditional_text', sanskrit: 'यावदूनम्' });
    expect(r.source).toMatch(/Bharati Krishna Tirtha/);
    expect(r.score).toBeGreaterThan(0);
    const [t] = await searchKnowledge('Nikhilam multiplication near a base');
    expect(['verified_math', 'traditional_text']).toContain(t.provenance);
  });

  it('returns nothing for unrelated questions instead of guessing', async () => {
    expect(await searchKnowledge('capital of France')).toEqual([]);
    expect(await searchKnowledge('')).toEqual([]);
    expect(await searchKnowledge(undefined)).toEqual([]);
  });

  it('is safe against query syntax tricks', async () => {
    await expect(searchKnowledge('"Nikhilam -sutra \\')).resolves.toBeInstanceOf(Array);
    expect((await top('-Nikhilam'))[0]).toMatch(/Nikhilam/); // a leading minus must not exclude the term
  });

  it('can filter by category', async () => {
    const r = await searchKnowledge('multiplier', { category: 'research', limit: 10 });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x.category === 'research')).toBe(true);
  });
});

describe('searchKnowledge tool (follow-ups use conversation context)', () => {
  it('falls back to the earlier topic when the model query has no topic', async () => {
    // "what about those" is all stop words: nothing to search for without the earlier topic.
    const withoutContext = await executeTool('searchKnowledge', { query: 'what about those' });
    expect(withoutContext.results).toEqual([]);
    expect(withoutContext.note).toMatch(/honestly/);

    const withContext = await executeTool('searchKnowledge', { query: 'what about those' }, { previousUserMessages: ['What is Vedic math?'] });
    expect(withContext.results[0].name).toMatch(/Vedic Mathematics \(overview\)|sixteen sutras/);
  });

  it('reports unknown tools and bad solver input as errors, not exceptions', async () => {
    expect((await executeTool('nope', {})).error).toMatch(/Unknown tool/);
    expect((await executeTool('check_divisibility', { number: '10', divisor: 12 })).error).toMatch(/divisor/);
    const ok = await executeTool('vedic_square', { number: '35' });
    expect(ok).toMatchObject({ answer: '1225' });
  });
});
