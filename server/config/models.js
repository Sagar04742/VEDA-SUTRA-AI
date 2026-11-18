// Friendly names for the models and providers, shown in the model picker and the Shastrarth (battle) arena.
export const PROVIDER_NAMES = { gemini: 'Gemini', groq: 'Groq', mistral: 'Mistral', openai: 'OpenAI', cohere: 'Cohere' };

const WORDS = { gpt: 'GPT', oss: 'OSS', qwen: 'Qwen', llama: 'Llama', latest: '', flash: 'Flash', lite: 'Lite', pro: 'Pro', mini: 'Mini', nano: 'Nano', ministral: 'Ministral', mistral: 'Mistral', gemini: 'Gemini', command: 'Command', small: 'Small', medium: 'Medium', large: 'Large' };

// "openai/gpt-oss-120b" -> "GPT-OSS 120B", "ministral-14b-latest" -> "Ministral 14B", "gemini-3.8-flash" -> "Gemini 3.8 Flash"
export function prettyModelName(id) {
  const base = String(id).split('/').pop();
  const parts = base.split('-').filter(Boolean);
  const out = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (key in WORDS) {
      if (WORDS[key]) out.push(WORDS[key]);
    } else if (/^\d+(\.\d+)?b$/i.test(p)) out.push(p.toUpperCase());
    else if (/^[a-z]+\d/i.test(p)) out.push(p.charAt(0).toUpperCase() + p.slice(1));
    else out.push(/^\d/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1));
  }
  // keep "GPT-OSS" together
  return out.join(' ').replace('GPT OSS', 'GPT-OSS').replace('GPT 4', 'GPT-4').replace('GPT 5', 'GPT-5').trim() || String(id);
}
