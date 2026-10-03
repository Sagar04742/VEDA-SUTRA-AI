import api from './client.js';

// The answer levels (Lite / Plus / Pro) the server offers.
export const modelsApi = {
  list: () => api.get('/models').then((r) => r.data),
};
