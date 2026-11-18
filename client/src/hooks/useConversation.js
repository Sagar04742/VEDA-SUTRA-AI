import { useCallback, useRef, useState } from 'react';
import { chatsApi, streamMessage } from '../api/chats.js';
import { mergeActivity } from '../components/ActivityTrail.jsx';

const STREAMING_ID = 'streaming';
let localId = 0;
const nextId = () => `local-${++localId}`;

// One open conversation: its messages, the live streaming answer, errors and retry.
// Callbacks let the page keep the sidebar and URL in sync.
export function useConversation({ onChatCreated, onChatDiscarded, onTitle, onActivity }) {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null); // { message, code, retryAfterSeconds, payload }
  const [notice, setNotice] = useState('');
  const chatIdRef = useRef(null);
  const abortRef = useRef(null);

  const patchStreaming = (fn) => setMessages((cur) => cur.map((m) => (m.id === STREAMING_ID ? fn(m) : m)));
  // Shastrarth (battle): change one side (a or b) of the live answer.
  const patchSide = (side, fn) => patchStreaming((m) => ({ ...m, battle: { ...m.battle, [side]: fn(m.battle[side]) } }));

  const stop = useCallback(() => abortRef.current?.abort(), []);

  // Show an empty "new chat" screen.
  const reset = useCallback(() => {
    abortRef.current?.abort();
    chatIdRef.current = null;
    setMessages([]);
    setError(null);
    setNotice('');
    setStreaming(false);
  }, []);

  // Open a saved chat (messages come from the server, never from local state).
  const load = useCallback(async (id) => {
    abortRef.current?.abort();
    chatIdRef.current = id;
    setError(null);
    setNotice('');
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

  // payload: { content, images: [{ mimeType, data, preview }], webSearch, deepExplain, tier, battle: { a, b, names } }
  const send = useCallback(
    async (payload) => {
      const content = (payload.content ?? '').trim();
      const images = payload.images ?? [];
      if ((!content && !images.length) || abortRef.current?.signal.aborted === false) return;
      setError(null);
      setNotice('');

      // Create the chat on first use so empty chats are never left behind by browsing.
      let id = chatIdRef.current;
      let createdNow = false;
      if (!id) {
        try {
          const chat = await chatsApi.create();
          id = chat.id;
          chatIdRef.current = id;
          createdNow = true;
          onChatCreated(chat);
        } catch (e) {
          setError({ message: e.response?.data?.error || 'Could not start a new chat. Please try again.', code: e.response?.data?.code, retryAfterSeconds: e.response?.data?.retryAfterSeconds, payload: { ...payload, content } });
          return;
        }
      }

      const cmp = payload.battle;
      const blankSide = (id) => ({ id, name: cmp.names?.[id] ?? id, startedAt: Date.now(), content: '', solver: [], sources: [], activity: [], error: null, notice: '', done: false });
      setMessages((cur) => [
        ...cur,
        { id: nextId(), role: 'user', content, images: images.map((i) => ({ id: nextId(), preview: i.preview })) },
        { id: STREAMING_ID, role: 'assistant', content: '', solver: [], sources: [], activity: [], streaming: true, ...(cmp ? { battle: { a: blankSide(cmp.a), b: blankSide(cmp.b) } } : {}) },
      ]);
      setStreaming(true);

      const ac = new AbortController();
      abortRef.current = ac;
      let failed = null;

      try {
        await streamMessage(
          id,
          { content, images: images.map(({ mimeType, data }) => ({ mimeType, data })), webSearch: Boolean(payload.webSearch), deepExplain: Boolean(payload.deepExplain), tier: payload.tier || 'lite', ...(cmp ? { battle: { a: cmp.a, b: cmp.b } } : {}) },
          {
            signal: ac.signal,
            onEvent: (event, data) => {
              if (data.side) {
                // Compare mode: every event says which side it belongs to.
                const { side, ...rest } = data;
                if (event === 'token') patchSide(side, (s) => ({ ...s, content: s.content + rest.text }));
                else if (event === 'solver') patchSide(side, (s) => ({ ...s, solver: [...s.solver, rest] }));
                else if (event === 'notice') patchSide(side, (s) => ({ ...s, notice: rest.message }));
                else if (event === 'activity') patchSide(side, (s) => ({ ...s, activity: mergeActivity(s.activity, rest) }));
                else if (event === 'side_error') patchSide(side, (s) => ({ ...s, error: rest, done: true, ms: rest.ms }));
                else if (event === 'side_done') patchSide(side, (s) => ({ ...s, done: true, ms: rest.ms }));
                return;
              }
              if (event === 'verdict') {
                patchStreaming((m) => ({
                  ...m,
                  battle: data.unscored
                    ? { ...m.battle, unscored: data.reason }
                    : { ...m.battle, a: { ...m.battle.a, ...data.a }, b: { ...m.battle.b, ...data.b }, winner: data.winner, margin: data.margin, evidence: data.evidence, judgedMs: data.judgedMs },
                }));
              } else if (event === 'activity') patchStreaming((m) => ({ ...m, activity: mergeActivity(m.activity, data) }));
              else if (event === 'token') patchStreaming((m) => ({ ...m, content: m.content + data.text }));
              else if (event === 'solver') patchStreaming((m) => ({ ...m, solver: [...m.solver, data] }));
              else if (event === 'notice') setNotice(data.message);
              else if (event === 'title') onTitle(id, data.title);
              else if (event === 'error') failed = data;
              else if (event === 'done') {
                // Replace the live bubble with the saved message.
                if (data.message) setMessages((cur) => cur.map((m) => (m.id === STREAMING_ID ? data.message : m)));
              }
            },
          }
        );
      } catch (e) {
        if (e.name !== 'AbortError') failed = { message: e.message || 'Connection lost', code: e.code, retryAfterSeconds: e.retryAfterSeconds };
      } finally {
        abortRef.current = null;
        setStreaming(false);
      }

      // Anything still marked as streaming either failed or was stopped.
      setMessages((cur) =>
        cur.flatMap((m) => {
          if (m.id !== STREAMING_ID) return [m];
          const kept = m.battle ? ['a', 'b'].some((s) => m.battle[s].content || m.battle[s].solver.length) : m.content || m.solver.length;
          if (failed || !kept) return []; // nothing worth keeping
          return [{ ...m, id: nextId(), streaming: false }]; // stopped: keep the partial answer
        })
      );
      if (failed) {
        setError({ ...failed, payload: { ...payload, content } });
        // A brand-new chat whose first message failed would just be an empty entry: discard it.
        // Retry then starts a fresh chat.
        if (createdNow) {
          chatIdRef.current = null;
          chatsApi.remove(id).catch(() => {});
          onChatDiscarded(id);
        }
      } else onActivity(id);
    },
    [onChatCreated, onChatDiscarded, onTitle, onActivity]
  );

  // Retry the message that failed: the server discarded it, so remove the unanswered bubble first.
  const retry = useCallback(() => {
    if (!error?.payload) return;
    const { payload } = error;
    setMessages((cur) => {
      const last = cur.at(-1);
      return last?.role === 'user' && last.content === payload.content ? cur.slice(0, -1) : cur;
    });
    send(payload);
  }, [error, send]);

  return { messages, streaming, loading, error, notice, chatIdRef, send, stop, retry, reset, load, dismissError: () => setError(null), dismissNotice: () => setNotice('') };
}
