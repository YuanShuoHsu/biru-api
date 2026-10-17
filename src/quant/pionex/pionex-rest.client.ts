import { BadGatewayException, Injectable } from '@nestjs/common';

import type { PionexEnvelope } from './pionex.types';

const PIONEX_REST_URL = 'https://api.pionex.com';

// 官方上限是 IP 與帳戶各 10 req/s，超過封鎖 60 秒，且封鎖期間再送會延長
const MIN_REQUEST_INTERVAL_MS = 125;
const RATE_LIMIT_BAN_MS = 60 * 1000;

export class PionexApiError extends BadGatewayException {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

@Injectable()
export class PionexRestClient {
  private nextSlotAt = 0;
  private queue: Promise<void> = Promise.resolve();

  private reserveSlot(weight: number): Promise<void> {
    const slot = this.queue.then(async () => {
      const wait = this.nextSlotAt - Date.now();
      if (wait > 0) await sleep(wait);
      this.nextSlotAt = Date.now() + MIN_REQUEST_INTERVAL_MS * weight;
    });
    this.queue = slot;

    return slot;
  }

  async get<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
    weight = 1,
  ): Promise<T> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params))
      if (value !== undefined) query.set(key, String(value));

    await this.reserveSlot(weight);

    const res = await fetch(`${PIONEX_REST_URL}${path}?${query}`, {
      headers: { Accept: 'application/json' },
    });
    if (res.status === 429) {
      this.nextSlotAt = Date.now() + RATE_LIMIT_BAN_MS;
      throw new PionexApiError('RATE_LIMITED', 'Pionex rate limit exceeded');
    }

    const body = (await res.json()) as PionexEnvelope<T>;
    if (!body.result || body.data === undefined)
      throw new PionexApiError(
        body.code ?? `HTTP_${res.status}`,
        body.message ?? 'Pionex request failed',
      );

    return body.data;
  }
}
