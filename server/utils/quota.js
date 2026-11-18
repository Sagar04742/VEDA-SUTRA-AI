// Understand "you hit the free-tier limit" errors from any AI provider (Gemini, Groq, Mistral) so the user
// gets a clear message and a countdown instead of a generic failure.

function parseBody(err) {
  try {
    const body = JSON.parse(String(err?.message ?? ''));
    return body.error ?? body;
  } catch {
    return null;
  }
}

// "34s" or "34.5s" -> 35
function delayToSeconds(value) {
  const m = String(value ?? '').match(/^([\d.]+)s$/);
  return m ? Math.ceil(Number(m[1])) : null;
}

// "3m2.5s", "12m", "1h2m", "3.5s" -> seconds (rounded up)
export function durationToSeconds(text) {
  const m = String(text ?? '').match(/(?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?/);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Math.ceil(Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0));
}

// Returns { rateLimited, retryAfterSeconds (number|null), daily (boolean) }.
export function parseQuotaError(err) {
  const text = String(err?.message ?? '');
  const status = err?.status ?? err?.statusCode ?? err?.code;
  const body = parseBody(err);
  const rateLimited = status === 429 || body?.status === 'RESOURCE_EXHAUSTED' || /RESOURCE_EXHAUSTED/.test(text);
  if (!rateLimited) return { rateLimited: false, retryAfterSeconds: null, daily: false };

  const details = body?.details ?? [];
  const retryInfo = details.find((d) => /RetryInfo/.test(d['@type'] ?? ''));
  const quota = details.find((d) => /QuotaFailure/.test(d['@type'] ?? ''));
  // Gemini says "PerDay"; Groq says "requests per day (RPD)" / "tokens per day (TPD)".
  const daily = /PerDay/i.test(JSON.stringify(quota ?? '')) || /PerDay|per day|\b(RPD|TPD)\b/i.test(text);

  const fromHeader = Number.isFinite(err?.retryAfterSeconds) ? Math.ceil(err.retryAfterSeconds) : null; // set by our provider clients
  const fromBody = delayToSeconds(retryInfo?.retryDelay);
  const fromText = text.match(/(?:retry|try again) (?:in|after) ([\dhms.]+)/i);
  const retryAfterSeconds = fromHeader ?? fromBody ?? (fromText ? durationToSeconds(fromText[1]) : null);
  return { rateLimited: true, retryAfterSeconds, daily };
}

// 90 -> "1 minute 30 seconds"
export function humanDuration(seconds) {
  if (seconds < 90) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const m = Math.round(seconds / 60);
  if (m < 90) return `about ${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.round(m / 60);
  return `about ${h} hour${h === 1 ? '' : 's'}`;
}

// A short, honest reason for a failed call: { reason, kind, retryAfterSeconds }.
// kind: 'key' (rejected), 'missing' (no such model), 'limit' (free usage limit), 'busy' (overloaded or a broken reply), 'error'.
export function failureReason(err) {
  const status = err?.status ?? err?.statusCode ?? err?.code;
  const quota = parseQuotaError(err);
  if (quota.rateLimited) {
    return {
      kind: 'limit',
      retryAfterSeconds: quota.daily ? null : quota.retryAfterSeconds,
      reason: quota.daily ? 'it has used its free daily limit' : quota.retryAfterSeconds ? `it is at its free usage limit (try again in ${humanDuration(quota.retryAfterSeconds)})` : 'it is at its free usage limit right now',
    };
  }
  if (status === 401 || status === 403) return { kind: 'key', reason: 'its API key is rejected' };
  if (status === 404) return { kind: 'missing', reason: 'the provider has no such model' };
  if ([500, 502, 503].includes(status) || isTransient(err)) return { kind: 'busy', reason: 'the provider is overloaded or sent a broken reply' };
  return { kind: 'error', reason: 'it did not answer properly' };
}

// Errors worth answering again on the next model: a rate limit, a busy or missing model, or a broken tool call.
const TRANSIENT = /incomplete json|unexpected end of json|unexpected token|fetch failed|econnreset|econnrefused|socket hang up|terminated|network|timed? ?out|etimedout|eai_again|stream/i;
export const isTransient = (err) => {
  const status = err?.status ?? err?.statusCode;
  return (status === undefined || status === null) && TRANSIENT.test(`${err?.code ?? ''} ${err?.message ?? ''}`) && err?.name !== 'AbortError';
};
export const isSwitchable = (err) => {
  const status = err?.status ?? err?.statusCode ?? err?.code;
  return parseQuotaError(err).rateLimited || [500, 502, 503, 404, 401, 403].includes(status) || err?.kind === 'tool_failed' || isTransient(err);
};
