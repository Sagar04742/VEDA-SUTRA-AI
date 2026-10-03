import { useCallback, useRef, useState } from 'react';
import { chatsApi, streamMessage } from '../api/chats.js';

const STREAMING_ID = 'streaming';
let localId = 0;
const nextId = () => `local-${++localId}`;

// One open conversation: its messages, the live streaming answer, errors and retry.
// Callbacks let the page keep the sidebar and URL in sync.
export function useConversation({ onChatCreated, onTitle, onActivity }) {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null); // { message, text }
  const chatIdRef = useRef(null);
  const abortRef = useRef(null);

  const patchStreaming = (fn) => setMessages((cur) => cur.map((m) => (m.id === STREAMING_ID ? fn(m) : m)));

  const stop = useCallback(() => abortRef.current?.abort(), []);

  // Show an empty "new chat" screen.
  const reset = useCallback(() => {
    abortRef.current?.abort();
    chatIdRef.current = null;
    setMessages([]);
    setError(null);
    setStreaming(false);
  }, []);

  // Open a saved chat (messages come from the server, never from local state).
  const load = useCallback(async (id) => {
    abortRef.current?.abort();
    chatIdRef.current = id;
    setError(null);
    setStreaming(false);
    setLoading(true);
    try {
      const chat = await chatsApi.get(id);
      if (chatIdRef.current === id) setMessages(chat.messages);
      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const send = useCallback(
    async (text) => {
      const content = text.trim();
      if (!content || abortRef.current?.signal.aborted === false) return;
      setError(null);

      // Create the chat on first use so empty chats are never left behind by browsing.
      let id = chatIdRef.current;
      if (!id) {
        try {
          const chat = await chatsApi.create();
          id = chat.id;
          chatIdRef.current = id;
          onChatCreated(chat);
        } catch (e) {
          setError({ message: e.response?.data?.error || 'Could not start a new chat', text: content });
          return;
        }
      }

      setMessages((cur) => [
        ...cur,
        { id: nextId(), role: 'user', content },
        { id: STREAMING_ID, role: 'assistant', content: '', solver: [], streaming: true },
      ]);
      setStreaming(true);

      const ac = new AbortController();
      abortRef.current = ac;
      let failed = null;

      try {
        await streamMessage(id, content, {
          signal: ac.signal,
          onEvent: (event, data) => {
            if (event === 'token') patchStreaming((m) => ({ ...m, content: m.content + data.text }));
            else if (event === 'solver') patchStreaming((m) => ({ ...m, solver: [...m.solver, data] }));
            else if (event === 'title') onTitle(id, data.title);
            else if (event === 'error') failed = data.message;
            else if (event === 'done') {
              // Replace the live bubble with the saved message.
              if (data.message) setMessages((cur) => cur.map((m) => (m.id === STREAMING_ID ? data.message : m)));
            }
          },
        });
      } catch (e) {
        if (e.name !== 'AbortError') failed = e.message || 'Connection lost';
      } finally {
        abortRef.current = null;
        setStreaming(false);
      }

      // Anything still marked as streaming either failed or was stopped.
      setMessages((cur) =>
        cur.flatMap((m) => {
          if (m.id !== STREAMING_ID) return [m];
          if (failed || (!m.content && !m.solver.length)) return []; // nothing worth keeping
          return [{ ...m, id: nextId(), streaming: false }]; // stopped: keep the partial answer
        })
      );
      if (failed) setError({ message: failed, text: content });
      else onActivity(id);
    },
    [onChatCreated, onTitle, onActivity]
  );

  // Retry the message that failed: the server discarded it, so remove the unanswered bubble first.
  const retry = useCallback(() => {
    if (!error) return;
    const { text } = error;
    setMessages((cur) => {
      const last = cur.at(-1);
      return last?.role === 'user' && last.content === text ? cur.slice(0, -1) : cur;
    });
    send(text);
  }, [error, send]);

  return { messages, streaming, loading, error, chatIdRef, send, stop, retry, reset, load, dismissError: () => setError(null) };
}
