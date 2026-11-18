import api from './client.js';

export const profileApi = {
  // tz = minutes behind UTC, so "today" and each day's bar match the user's own clock
  stats: () => api.get('/profile/stats', { params: { tz: new Date().getTimezoneOffset() } }).then((r) => r.data),
  // The Shastrarth leaderboard: Elo ratings of the models from this user's battles
  arena: () => api.get('/profile/arena').then((r) => r.data),
  publicStats: () => api.get('/stats/public').then((r) => r.data),
};
