import api from './client.js';

// The answer levels (Lite / Plus / Pro) the server offers.
export const modelsApi = {
  list: () => api.get('/models').then((r) => r.data),
  // The readiness check: { [id]: { ready, via?, ms?, reason? } }. fresh = ask again instead of using the short memory.
  ready: (ids, fresh = false) => api.post('/models/ready', { ids, fresh }).then((r) => r.data.results),
};
