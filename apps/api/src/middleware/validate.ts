import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';

/**
 * Express middleware factory: validates req.body against a Zod schema.
 * On success, replaces req.body with the parsed (and defaulted) data.
 * On failure, returns 400 with flattened field errors.
 *
 * @example
 * router.post('/', validate(createMonitorSchema), async (req, res) => {
 *   // req.body is typed and validated
 * });
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'validation_error',
        details: result.error.flatten(),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Express middleware factory: validates req.query against a Zod schema.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        error: 'validation_error',
        details: result.error.flatten(),
      });
      return;
    }
    (req as unknown as { validatedQuery: unknown }).validatedQuery = result.data;
    next();
  };
}
