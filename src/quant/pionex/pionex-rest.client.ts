import { BadGatewayException, Injectable } from '@nestjs/common';

import { createHmac } from 'node:crypto';

import type { PionexEnvelope } from './pionex.types';

const PIONEX_REST_URL = 'https://api.pionex.com';

// 官方上限是 IP 與帳戶各 10 req/s，超過封鎖 60 秒，且封鎖期間再送會延長
const MIN_REQUEST_INTERVAL_MS = 125;
const RATE_LIMIT_BAN_MS = 60 * 1000;

// 訂單與成交 id 是 JSON 數字，超過 2^53 會被 JSON.parse 改掉，一律保留原始字串
const ID_KEYS = new Set(['id', 'orderId']);

export interface PionexCredentials {
  apiKey: string;
  apiSecret: string;
}

type QueryParams = Record<string, string | number | undefined>;

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

export const signPionex = (secret: string, payload: string) =>
  createHmac('sha256', secret).update(payload).digest('hex');

// https://pionex-doc.gitbook.io/apidocs/restful/general/authentication
export const buildSignedQuery = (params: QueryParams, timestamp: number) =>
  Object.entries({ ...params, timestamp })
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

const parseBody = <T>(text: string) =>
  JSON.parse(
    text,
    // Node 22 起 reviver 第三個參數帶原始字面值
    (key, value: unknown, context?: { source?: string }) =>
      ID_KEYS.has(key) && typeof value === 'number'
        ? (context?.source ?? String(value))
        : value,
  ) as PionexEnvelope<T>;

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

  get<T>(path: string, params: QueryParams = {}, weight = 1): Promise<T> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params))
      if (value !== undefined) query.set(key, String(value));

    return this.send<T>(`${path}?${query}`, { method: 'GET' }, weight);
  }

  signed<T>(
    credentials: PionexCredentials,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    {
      body,
      params = {},
      weight = 1,
    }: { body?: object | string; params?: QueryParams; weight?: number } = {},
  ): Promise<T> {
    const pathWithQuery = `${path}?${buildSignedQuery(params, Date.now())}`;
    const json = typeof body === 'string' ? body : body && JSON.stringify(body);

    return this.send<T>(
      pathWithQuery,
      {
        body: json,
        headers: {
          'Content-Type': 'application/json',
          'PIONEX-KEY': credentials.apiKey,
          'PIONEX-SIGNATURE': signPionex(
            credentials.apiSecret,
            `${method}${pathWithQuery}${method === 'GET' ? '' : (json ?? '')}`,
          ),
        },
        method,
      },
      weight,
    );
  }

  private async send<T>(
    pathWithQuery: string,
    init: RequestInit,
    weight: number,
  ): Promise<T> {
    await this.reserveSlot(weight);

    const res = await fetch(`${PIONEX_REST_URL}${pathWithQuery}`, {
      ...init,
      headers: { Accept: 'application/json', ...init.headers },
    });
    if (res.status === 429) {
      this.nextSlotAt = Date.now() + RATE_LIMIT_BAN_MS;
      throw new PionexApiError('RATE_LIMITED', 'Pionex rate limit exceeded');
    }

    const body = parseBody<T>(await res.text());
    if (!body.result)
      throw new PionexApiError(
        body.code ?? `HTTP_${res.status}`,
        body.message ?? 'Pionex request failed',
      );

    return body.data as T;
  }
}
