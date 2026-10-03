import { env } from '../config/env.js';

export const notFound = (_req, res) => res.status(404).json({ error: 'Not found' });

// Builds the JSON body. Server errors never expose details or stack traces in production.
export function errorBody(err, isProd = env.isProd) {
  const status = err.status || 500;
  if (status < 500) return { status, body: { error: err.message } };
  return {
    status,
    body: isProd ? { error: 'Something went wrong' } : { error: err.message, stack: err.stack },
  };
}

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, _req, res, _next) => {
  const { status, body } = errorBody(err);
  if (status >= 500) console.error(err);
  res.status(status).json(body);
};
