import mongoose from 'mongoose';

export const PROVENANCE = ['verified_math', 'traditional_text', 'interpretation'];

const knowledgeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sanskrit: { type: String, default: '' },
    meaning: { type: String, default: '' },
    category: { type: String, default: 'general', index: true },
    whenToUse: { type: String, default: '' },
    steps: { type: [String], default: [] },
    examples: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    source: { type: String, required: true },
    provenance: { type: String, enum: PROVENANCE, required: true },
    sourceFile: { type: String, index: true }, // which raw file it came from (lets ingest replace it cleanly)
    kind: { type: String, enum: ['curated', 'book'], default: 'curated', index: true }, // 'book' = a chunk of a whole book (data/books.js)
  },
  { timestamps: true }
);

// v1 retrieval: weighted text index. Name and Sanskrit matter most, then tags, then the body.
knowledgeSchema.index(
  { name: 'text', sanskrit: 'text', tags: 'text', meaning: 'text', whenToUse: 'text', examples: 'text', steps: 'text' },
  {
    name: 'knowledge_text',
    default_language: 'english',
    weights: { name: 10, sanskrit: 8, tags: 6, meaning: 3, whenToUse: 2, examples: 1, steps: 1 },
  }
);

export default mongoose.model('Knowledge', knowledgeSchema);
