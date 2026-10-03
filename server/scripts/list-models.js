// Shows which models your API keys can use:  npm run models -w server
import { GoogleGenAI } from '@google/genai';
import { Mistral } from '@mistralai/mistralai';

async function gemini() {
  if (!process.env.GEMINI_API_KEY) return console.log('Gemini: GEMINI_API_KEY not set');
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const pager = await ai.models.list({ config: { pageSize: 100 } });
    console.log('Gemini models that can generate content:');
    for await (const m of pager) {
      if (!(m.supportedActions ?? []).includes('generateContent')) continue;
      console.log(`  ${m.name.replace(/^models\//, '')}  (in ${m.inputTokenLimit ?? '?'} / out ${m.outputTokenLimit ?? '?'} tokens)  ${m.displayName ?? ''}`);
    }
  } catch (e) {
    console.log('Gemini: could not list models:', e.status ?? '', String(e.message).slice(0, 200));
  }
}

async function mistral() {
  if (!process.env.MISTRAL_API_KEY) return console.log('Mistral: MISTRAL_API_KEY not set');
  try {
    const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });
    const res = await client.models.list();
    console.log('\nMistral models:');
    for (const m of res.data ?? []) {
      if (m.capabilities && !m.capabilities.completionChat) continue;
      console.log(`  ${m.id}${m.aliases?.length ? `  (aliases: ${m.aliases.join(', ')})` : ''}`);
    }
  } catch (e) {
    console.log('Mistral: could not list models:', e.statusCode ?? '', String(e.message).slice(0, 200));
  }
}

await gemini();
await mistral();
