// Understand "you hit the free-tier limit" errors from the Gemini API so the user gets a clear message
// and a countdown instead of a generic failure.

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

// Returns { rateLimited, retryAfterSeconds (number|null), daily (boolean) }.
export function parseQuotaError(err) {
  const text = String(err?.message ?? '');
  const status = err?.status ?? err?.code;
  const body = parseBody(err);
  const rateLimited = status === 429 || body?.status === 'RESOURCE_EXHAUSTED' || /RESOURCE_EXHAUSTED/.test(text);
  if (!rateLimited) return { rateLimited: false, retryAfterSeconds: null, daily: false };

  const details = body?.details ?? [];
  const retryInfo = details.find((d) => /RetryInfo/.test(d['@type'] ?? ''));
  const quota = details.find((d) => /QuotaFailure/.test(d['@type'] ?? ''));
  const daily = /PerDay/i.test(JSON.stringify(quota ?? '')) || /PerDay|per day/i.test(text);

  const fromBody = delayToSeconds(retryInfo?.retryDelay);
  const fromText = text.match(/retry (?:in|after) ([\d.]+)\s*s/i);
  const retryAfterSeconds = fromBody ?? (fromText ? Math.ceil(Number(fromText[1])) : null);
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
