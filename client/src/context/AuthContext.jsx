import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi } from '../api/client.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

// The start-up loader stays up at least this long, so it can be seen and enjoyed instead of flashing by.
export const MIN_BOOT_MS = 2200;
const startedAt = Date.now();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true until the first /me check finishes
  const [booted, setBooted] = useState(false); // true once the check is done AND the loader has been shown long enough

  // Restore the session from the cookie on page load.
  useEffect(() => {
    authApi
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => {
        setLoading(false);
        setTimeout(() => setBooted(true), Math.max(0, MIN_BOOT_MS - (Date.now() - startedAt)));
      });
  }, []);

  const signup = useCallback(async (data) => setUser(await authApi.signup(data)), []);
  const login = useCallback(async (data) => setUser(await authApi.login(data)), []);
  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {});
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, booted, signup, login, logout }}>{children}</AuthContext.Provider>;
}
