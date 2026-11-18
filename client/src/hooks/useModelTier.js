import { useCallback, useEffect, useState } from 'react';
import { modelsApi } from '../api/models.js';

const KEY = 'modelTier';
const read = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

// The answer level picked in the model picker (remembered in this browser; "lite" is the default),
// plus what the server says it can do right now (for example whether Web search is available).
export function useModelTier() {
  const [tiers, setTiers] = useState([]);
  const [arena, setArena] = useState([]); // everyone who can enter a Shastrarth battle: the levels and single models
  const [tier, setTierState] = useState(read() || 'lite');
  const [capabilities, setCapabilities] = useState({ webSearch: true });

  const refresh = useCallback(
    () =>
      modelsApi
        .list()
        .then(({ tiers: list, arena: fighters, default: def, capabilities: caps }) => {
          setTiers(list);
          setArena(fighters ?? []);
          if (caps) setCapabilities(caps);
          // Forget a saved level that no longer exists.
          setTierState((cur) => (list.some((t) => t.id === cur) ? cur : def));
        })
        .catch(() => {}),
    []
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setTier = useCallback((id) => {
    setTierState(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* private mode: ignore */
    }
  }, []);

  return { tiers, arena, tier, setTier, current: tiers.find((t) => t.id === tier), capabilities, refresh };
}
