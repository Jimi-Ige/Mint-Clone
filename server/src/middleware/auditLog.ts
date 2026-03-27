import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

/**
 * Audit logger for state-changing operations (POST, PUT, PATCH, DELETE).
 * Logs the action with user context after the response is sent.
 */
export function auditLog(req: Request, res: Response, next: NextFunction) {
  // Only audit mutations
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  // Skip non-API and health/version routes
  if (!req.path.startsWith('/api/') || req.path === '/api/health') return next();

  res.on('finish', () => {
    const userId = (req as any).userId;

    // Only log successful mutations
    if (res.statusCode >= 400) return;

    const resource = req.path
      .replace('/api/', '')
      .split('/')[0]; // e.g., "transactions", "accounts"

    logger.info('Audit', {
      action: req.method,
      resource,
      path: req.path,
      userId: userId || 'anonymous',
      status: res.statusCode,
      ip: req.ip,
    });
  });

  next();
}
