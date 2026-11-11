import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';

import {
  IDEMPOTENCY_KEY_MAX_LENGTH,
  idempotencyKeyOf,
} from './idempotency-key.decorator.js';

const requestWith = (key?: string) =>
  ({
    headers: key === undefined ? {} : { 'idempotency-key': key },
  }) as Request;

describe('idempotencyKeyOf', () => {
  it.each([undefined, ''])('沒有鍵時回 null（%j）', (key) => {
    expect(idempotencyKeyOf(requestWith(key))).toBeNull();
  });

  it('上限內的鍵原樣回傳', () => {
    const key = 'k'.repeat(IDEMPOTENCY_KEY_MAX_LENGTH);
    expect(idempotencyKeyOf(requestWith(key))).toBe(key);
  });

  it('超過上限的鍵回 400，不會寫進唯一索引', () => {
    expect(() =>
      idempotencyKeyOf(requestWith('k'.repeat(IDEMPOTENCY_KEY_MAX_LENGTH + 1))),
    ).toThrow(BadRequestException);
  });
});
