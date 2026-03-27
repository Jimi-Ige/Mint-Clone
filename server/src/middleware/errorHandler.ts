import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const isProd = process.env.NODE_ENV === 'production';

  logger.error('Unhandled error', {
    error: err.message,
    stack: isProd ? undefined : err.stack,
    method: req.method,
    path: req.path,
    userId: (req as any).userId,
  });

  res.status(500).json({
    error: isProd ? 'Internal server error' : (err.message || 'Internal server error'),
  });
}
