import { useCallback, useEffect, useState } from 'react';
import { chatsApi } from '../api/chats.js';

// The sidebar's list of chats (newest first) with rename / delete.
export function useChats() {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    chatsApi
      .list()
      // Merge instead of overwrite: a chat created while this request was in flight must not vanish.
      .then((server) => setChats((cur) => [...cur.filter((c) => !server.some((s) => s.id === c.id)), ...server]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Add a chat, or move an existing one to the top.
  const upsertTop = useCallback((chat) => {
    setChats((cur) => [{ ...cur.find((c) => c.id === chat.id), ...chat }, ...cur.filter((c) => c.id !== chat.id)]);
  }, []);

  // Live title updates arrive from the stream (event: title).
  const setTitle = useCallback((id, title) => {
    setChats((cur) => cur.map((c) => (c.id === id ? { ...c, title } : c)));
  }, []);

  const dropLocal = useCallback((id) => setChats((cur) => cur.filter((c) => c.id !== id)), []);

  const rename = useCallback(async (id, title) => {
    const previous = chats.find((c) => c.id === id)?.title;
    setTitle(id, title); // optimistic
    try {
      await chatsApi.rename(id, title);
    } catch {
      setTitle(id, previous);
    }
  }, [chats, setTitle]);

  const remove = useCallback(async (id) => {
    await chatsApi.remove(id);
    setChats((cur) => cur.filter((c) => c.id !== id));
  }, []);

  return { chats, loading, upsertTop, setTitle, dropLocal, rename, remove };
}
