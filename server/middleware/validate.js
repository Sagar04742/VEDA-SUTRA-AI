import { HttpError } from '../utils/httpError.js';

// Validate req.body with a zod schema and replace it with the parsed value.
export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    return next(new HttpError(400, result.error.issues.map((i) => i.message).join('. ')));
  }
  req.body = result.data;
  next();
};
