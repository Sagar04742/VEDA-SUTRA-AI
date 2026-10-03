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

// The answer level picked in the model picker. Remembered in this browser; "lite" is the default.
export function useModelTier() {
  const [tiers, setTiers] = useState([]);
  const [tier, setTierState] = useState(read() || 'lite');

  useEffect(() => {
    modelsApi
      .list()
      .then(({ tiers: list, default: def }) => {
        setTiers(list);
        // Forget a saved level that no longer exists.
        setTierState((cur) => (list.some((t) => t.id === cur) ? cur : def));
      })
      .catch(() => {});
  }, []);

  const setTier = useCallback((id) => {
    setTierState(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* private mode: ignore */
    }
  }, []);

  return { tiers, tier, setTier, current: tiers.find((t) => t.id === tier) };
}
