/**
 * Pino logger singleton. Structured single-line JSON for log shipping.
 */

import pino from 'pino';

const SERVICE = 'traditional-medicine-notifier-bot';

let instance: pino.Logger | null = null;

export function initLogger(level: string): pino.Logger {
  instance = pino({
    level,
    base: { service: SERVICE },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
  return instance;
}

export function getLogger(): pino.Logger {
  if (instance === null) {
    // Lazy default for tests / boot-order edge cases.
    instance = pino({ level: 'info', base: { service: SERVICE } });
  }
  return instance;
}
