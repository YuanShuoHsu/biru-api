import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

import type { OrderMode } from 'src/db/schema/orders';

const KEY_BYTES = 32;
const DINE_IN_TABLE_PURPOSE = 'biru-dine-in-table-v1';
const ORDER_MODE_PURPOSE = 'biru-order-mode-v1';

export const modeTokenOrderModes = [
  'counter',
  'driveThru',
] as const satisfies readonly OrderMode[];

export type ModeTokenOrderMode = (typeof modeTokenOrderModes)[number];

const sign = (purpose: string, message: string) => {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required');
  const key = Buffer.from(
    hkdfSync('sha256', secret, purpose, purpose, KEY_BYTES),
  );
  return createHmac('sha256', key).update(message).digest('base64url');
};

const isSameToken = (expected: string, token: string) => {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(token);
  return (
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer)
  );
};

export const dineInTableToken = (organizationId: string, tableNumber: number) =>
  sign(DINE_IN_TABLE_PURPOSE, `${organizationId}:${tableNumber}`);

export const isValidDineInTableToken = (
  organizationId: string,
  tableNumber: number | undefined,
  token: string | undefined,
) =>
  !!tableNumber &&
  !!token &&
  isSameToken(dineInTableToken(organizationId, tableNumber), token);

export const orderModeToken = (
  organizationId: string,
  mode: ModeTokenOrderMode,
) => sign(ORDER_MODE_PURPOSE, `${organizationId}:${mode}`);

export const isValidOrderModeToken = (
  organizationId: string,
  mode: ModeTokenOrderMode,
  token: string | undefined,
) => !!token && isSameToken(orderModeToken(organizationId, mode), token);
