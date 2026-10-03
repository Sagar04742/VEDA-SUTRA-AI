// Builds the conversation sent to the model. The history ALWAYS comes from the database,
// never from the client. The system prompt is passed separately by the model service,
// so trimming old messages can never drop it.

// Merge consecutive turns with the same role (the model API expects alternating roles).
export function mergeTurns(messages) {
  const out = [];
  for (const m of messages) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else out.push({ role: m.role, content: m.content });
  }
  return out;
}

// prior: messages already saved in the chat (oldest first). Returns prior (last `limit`) + the new user message.
export function buildConversation(prior, newUserText, limit = 20) {
  let recent = prior.filter((m) => m.content && m.content.trim()).slice(-Math.max(1, limit));
  // The conversation must start with a user turn.
  while (recent.length && recent[0].role !== 'user') recent = recent.slice(1);
  return mergeTurns([...recent, { role: 'user', content: newUserText }]);
}
