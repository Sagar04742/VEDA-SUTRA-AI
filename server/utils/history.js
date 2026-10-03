// Builds the conversation sent to the model. The history ALWAYS comes from the database,
// never from the client. The system prompt is passed separately by the model service,
// so trimming old messages can never drop it.
//
// A turn is { role, content, imageIds? }. imageIds point at stored pictures (attached later).

// Merge consecutive turns with the same role (the model API expects alternating roles).
export function mergeTurns(messages) {
  const out = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.content = [last.content, m.content].filter(Boolean).join('\n\n');
      if (m.imageIds?.length) last.imageIds = [...(last.imageIds ?? []), ...m.imageIds];
    } else out.push({ role: m.role, content: m.content, ...(m.imageIds?.length ? { imageIds: [...m.imageIds] } : {}) });
  }
  return out;
}

// prior: messages already saved in the chat (oldest first). Returns prior (last `limit`) + the new user message.
export function buildConversation(prior, newUserText, limit = 20, newImageIds = []) {
  const hasContent = (m) => (m.content && m.content.trim()) || m.imageIds?.length;
  let recent = prior.filter(hasContent).slice(-Math.max(1, limit));
  // The conversation must start with a user turn.
  while (recent.length && recent[0].role !== 'user') recent = recent.slice(1);
  return mergeTurns([...recent, { role: 'user', content: newUserText, imageIds: newImageIds }]);
}
