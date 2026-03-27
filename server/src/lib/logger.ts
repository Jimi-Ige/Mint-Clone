const isProd = process.env.NODE_ENV === 'production';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: any;
}

function formatLog(level: LogLevel, message: string, meta?: Record<string, any>): string {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  if (isProd) {
    return JSON.stringify(entry);
  }

  // Pretty format for development
  const prefix = {
    info: '\x1b[36mINFO\x1b[0m',
    warn: '\x1b[33mWARN\x1b[0m',
    error: '\x1b[31mERROR\x1b[0m',
    debug: '\x1b[90mDEBUG\x1b[0m',
  }[level];

  const metaStr = meta && Object.keys(meta).length > 0
    ? ' ' + JSON.stringify(meta)
    : '';

  return `${entry.timestamp} [${prefix}] ${message}${metaStr}`;
}

export const logger = {
  info(message: string, meta?: Record<string, any>) {
    console.log(formatLog('info', message, meta));
  },
  warn(message: string, meta?: Record<string, any>) {
    console.warn(formatLog('warn', message, meta));
  },
  error(message: string, meta?: Record<string, any>) {
    console.error(formatLog('error', message, meta));
  },
  debug(message: string, meta?: Record<string, any>) {
    if (!isProd) {
      console.debug(formatLog('debug', message, meta));
    }
  },
};
