import axios from 'axios';

export const API_BASE = `${import.meta.env.VITE_API_URL || ''}/api`;

// Cookies carry the session. VITE_API_URL is only needed when the API lives on another origin.
const api = axios.create({ baseURL: API_BASE, withCredentials: true });

// While the API restarts (a saved server file, a deploy) the proxy answers 502 or the connection is refused. Either way
// the request never reached the app, so it is safe to repeat, even a signup. Wait a little and try again.
const RETRY_DELAYS = [600, 1200, 2000, 3000, 4000];
const neverReached = (e) => !e.response ? e.code === 'ERR_NETWORK' : e.response.status === 502;

// If the session expires while using the app, go back to the login page.
api.interceptors.response.use(
  (r) => r,
  async (e) => {
    const cfg = e.config;
    if (cfg && !cfg.signal?.aborted && neverReached(e)) {
      const n = cfg.__retry ?? 0;
      if (n < RETRY_DELAYS.length) {
        cfg.__retry = n + 1;
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[n]));
        return api.request(cfg);
      }
    }
    const url = e.config?.url ?? '';
    if (e.response?.status === 401 && !url.startsWith('/auth/') && location.pathname !== '/login') location.assign('/login');
    return Promise.reject(e);
  }
);

// Pull a readable message out of an axios error.
export const errorMessage = (e) => {
  if (neverReached(e)) return 'The server is not reachable right now (it may be restarting). Please try again in a moment.';
  return e.response?.data?.error || e.message || 'Something went wrong';
};

export const authApi = {
  signup: (body) => api.post('/auth/signup', body).then((r) => r.data.user),
  login: (body) => api.post('/auth/login', body).then((r) => r.data.user),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me').then((r) => r.data.user),
};

export default api;
