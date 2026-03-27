import path from 'path';
import dotenv from 'dotenv';
import { logger } from './lib/logger';
import { initializeDatabase } from './db/schema';
import { validateEnv } from './middleware/envCheck';
import { createApp } from './app';
import { checkNotifications } from './services/notifications';

dotenv.config({ path: path.join(__dirname, '../.env') });

// Validate required env vars before doing anything else
validateEnv();

const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

const clientDist = path.join(__dirname, '../../client/dist');

const app = createApp({
  skipRateLimit: false,
  skipLogging: false,
  trustProxy: isProd,
  corsOrigin: isProd ? process.env.CORS_ORIGIN || true : true,
  staticDir: clientDist,
});

// Initialize database and start server
initializeDatabase()
  .then(() => {
    const server = app.listen(PORT, () => {
      logger.info(`Server running on http://localhost:${PORT}`, { env: process.env.NODE_ENV || 'development' });
    });

    // Run notification checks every hour
    const NOTIFICATION_INTERVAL = 60 * 60 * 1000;
    const notificationTimer = setInterval(() => {
      checkNotifications().catch(err =>
        logger.error('Notification check error', { error: (err as Error).message })
      );
    }, NOTIFICATION_INTERVAL);
    // Run once on startup after a short delay
    setTimeout(() => checkNotifications().catch(() => {}), 10_000);

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received — shutting down gracefully`);
      clearInterval(notificationTimer);

      server.close(async () => {
        logger.info('HTTP server closed');

        try {
          const pool = (await import('./db/connection')).default;
          await pool.end();
          logger.info('Database pool closed');
        } catch (err) {
          logger.error('Error closing database pool', { error: (err as Error).message });
        }

        process.exit(0);
      });

      // Force exit after 10s if graceful shutdown stalls
      setTimeout(() => {
        logger.error('Graceful shutdown timed out — forcing exit');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  })
  .catch((err) => {
    logger.error('Failed to initialize database', { error: err.message });
    process.exit(1);
  });
