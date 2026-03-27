import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

/**
 * Logs every HTTP request with method, path, status, and duration.
 * Skips health checks to avoid log noise.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  // Skip health check logging
  if (req.path === '/api/health') return next();

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const userId = (req as any).userId;

    const meta: Record<string, any> = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    };

    if (userId) meta.userId = userId;
    if (req.query && Object.keys(req.query).length > 0) meta.query = req.query;

    if (res.statusCode >= 500) {
      logger.error('Request failed', meta);
    } else if (res.statusCode >= 400) {
      logger.warn('Client error', meta);
    } else {
      logger.info('Request', meta);
    }
  });

  next();
}
