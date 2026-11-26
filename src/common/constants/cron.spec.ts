import { afterEach, describe, expect, it, vi } from 'vitest';

const cronEnabled = async (env: Record<string, string>) => {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  vi.resetModules();
  return (await import('./cron.js')).CRON_ENABLED;
};

describe('CRON_ENABLED', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('follows ECPAY_OPERATION_MODE when CRON_ENABLED is unset', async () => {
    expect(
      await cronEnabled({
        CRON_ENABLED: '',
        ECPAY_OPERATION_MODE: 'Production',
      }),
    ).toBe(true);
    expect(
      await cronEnabled({ CRON_ENABLED: '', ECPAY_OPERATION_MODE: 'Test' }),
    ).toBe(false);
  });

  it('takes CRON_ENABLED over ECPAY_OPERATION_MODE when it is set', async () => {
    expect(
      await cronEnabled({ CRON_ENABLED: 'true', ECPAY_OPERATION_MODE: 'Test' }),
    ).toBe(true);
    expect(
      await cronEnabled({
        CRON_ENABLED: 'false',
        ECPAY_OPERATION_MODE: 'Production',
      }),
    ).toBe(false);
  });
});
