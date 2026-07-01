import type { Logger } from 'pino';
import { describe, expect, it } from 'vitest';

import { guardTick, startCronTick } from './cron-tick';

interface ErrCall {
  obj: Record<string, unknown>;
  msg: string;
}

/** Records `error` calls; everything else is a no-op. Cast to the pino shape. */
function makeFakeLogger(): { log: Logger; errorCalls: ErrCall[] } {
  const errorCalls: ErrCall[] = [];
  const log = {
    info: () => {},
    warn: () => {},
    debug: () => {},
    error: (obj: unknown, msg?: string) =>
      errorCalls.push({ obj: (obj ?? {}) as Record<string, unknown>, msg: msg ?? '' }),
  } as unknown as Logger;
  return { log, errorCalls };
}

describe('startCronTick', () => {
  it('throws at startup on an invalid cron expression', () => {
    expect(() =>
      startCronTick({
        cronExpression: 'not a cron',
        timezone: 'UTC',
        tick: () => Promise.resolve(),
        dispatchLabel: 'test',
        tickLabel: 'test',
      }),
    ).toThrow(/Invalid cron expression/);
  });
});

describe('guardTick', () => {
  it('catches a rejecting tick and logs it, resolving instead of throwing', async () => {
    const { log, errorCalls } = makeFakeLogger();
    const boom = new Error('tick blew up');
    const guarded = guardTick(() => Promise.reject(boom), 'reminder', log);

    await expect(guarded()).resolves.toBeUndefined();
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0]?.msg).toBe('reminder tick failed');
    expect(errorCalls[0]?.obj).toMatchObject({ err: boom });
  });

  it('runs the tick and logs nothing when it succeeds', async () => {
    const { log, errorCalls } = makeFakeLogger();
    let ran = false;
    const guarded = guardTick(
      () => {
        ran = true;
        return Promise.resolve();
      },
      'daily-tip',
      log,
    );

    await guarded();
    expect(ran).toBe(true);
    expect(errorCalls).toHaveLength(0);
  });
});
