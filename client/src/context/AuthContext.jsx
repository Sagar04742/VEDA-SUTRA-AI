import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi } from '../api/client.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true until the first /me check finishes

  // Restore the session from the cookie on page load.
  useEffect(() => {
    authApi
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const signup = useCallback(async (data) => setUser(await authApi.signup(data)), []);
  const login = useCallback(async (data) => setUser(await authApi.login(data)), []);
  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {});
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, signup, login, logout }}>{children}</AuthContext.Provider>;
}
