import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, ZodIssue } from 'zod';

/**
 * Express middleware factory that validates req.body against a Zod schema.
 * On failure, returns 400 with structured error messages.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const messages = err.issues.map((e: ZodIssue) => `${e.path.join('.')}: ${e.message}`);
        return res.status(400).json({ error: 'Validation failed', details: messages });
      }
      next(err);
    }
  };
}

/**
 * Validates req.query against a Zod schema.
 */
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as any;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const messages = err.issues.map((e: ZodIssue) => `${e.path.join('.')}: ${e.message}`);
        return res.status(400).json({ error: 'Validation failed', details: messages });
      }
      next(err);
    }
  };
}
