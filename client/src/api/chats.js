import api, { API_BASE } from './client.js';

export const chatsApi = {
  list: () => api.get('/chats').then((r) => r.data.chats),
  create: () => api.post('/chats').then((r) => r.data.chat),
  get: (id) => api.get(`/chats/${id}`).then((r) => r.data.chat),
  rename: (id, title) => api.patch(`/chats/${id}`, { title }).then((r) => r.data.chat),
  remove: (id) => api.delete(`/chats/${id}`),
};

export const imageUrl = (chatId, imageId) => `${API_BASE}/chats/${chatId}/images/${imageId}`;

// Split an SSE text buffer into complete events. Returns [events, leftover].
export function parseSseBuffer(buffer) {
  const events = [];
  let rest = buffer;
  let i;
  while ((i = rest.indexOf('\n\n')) >= 0) {
    const block = rest.slice(0, i);
    rest = rest.slice(i + 2);
    const event = block.match(/^event: (.*)$/m)?.[1];
    const data = block.match(/^data: (.*)$/m)?.[1];
    if (event && data) events.push({ event, data: JSON.parse(data) });
  }
  return [events, rest];
}

// POST a message and read the Server-Sent Events stream. (EventSource cannot POST, so we use fetch.)
// payload: { content, images: [{mimeType, data}], webSearch, deepExplain }
// Aborting `signal` closes the connection, which also makes the server stop generating.
export async function streamMessage(chatId, payload, { signal, onEvent }) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) location.assign('/login');
    throw Object.assign(new Error(body.error || `Request failed (${res.status})`), { code: body.code, retryAfterSeconds: body.retryAfterSeconds });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    const [events, rest] = parseSseBuffer(buffer);
    buffer = rest;
    events.forEach(({ event, data }) => onEvent(event, data));
  }
}
