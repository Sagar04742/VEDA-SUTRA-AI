import axios from 'axios';

export const API_BASE = `${import.meta.env.VITE_API_URL || ''}/api`;

// Cookies carry the session. VITE_API_URL is only needed when the API lives on another origin.
const api = axios.create({ baseURL: API_BASE, withCredentials: true });

// If the session expires while using the app, go back to the login page.
api.interceptors.response.use(
  (r) => r,
  (e) => {
    const url = e.config?.url ?? '';
    if (e.response?.status === 401 && !url.startsWith('/auth/') && location.pathname !== '/login') location.assign('/login');
    return Promise.reject(e);
  }
);

// Pull a readable message out of an axios error.
export const errorMessage = (e) => e.response?.data?.error || e.message || 'Something went wrong';

export const authApi = {
  signup: (body) => api.post('/auth/signup', body).then((r) => r.data.user),
  login: (body) => api.post('/auth/login', body).then((r) => r.data.user),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me').then((r) => r.data.user),
};

export default api;
