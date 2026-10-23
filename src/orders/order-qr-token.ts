import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

import type { Response } from 'express';

import type { OrderMode } from '../db/schema/orders.js';

const KEY_BYTES = 32;
const DINE_IN_TABLE_PURPOSE = 'biru-dine-in-table-v1';
const ORDER_MODE_PURPOSE = 'biru-order-mode-v1';
const ORDER_QR_SESSION_PURPOSE = 'biru-order-qr-session-v1';

export const ORDER_QR_SESSION_COOKIE = 'biru_order_qr_session';

export const modeTokenOrderModes = [
  'counter',
  'driveThru',
] as const satisfies readonly OrderMode[];

export type ModeTokenOrderMode = (typeof modeTokenOrderModes)[number];

export const qrOrderModes = [
  'dineIn',
  ...modeTokenOrderModes,
] as const satisfies readonly OrderMode[];

export type QrOrderMode = (typeof qrOrderModes)[number];

const ORDER_QR_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export type OrderQrSession = {
  expiresAt: Date;
  mode: QrOrderMode;
  tableNumber: number | null;
};

// qrSecret 為 NULL 時 salt 必須維持 purpose，已印出的 QR code 才會繼續有效
const sign = (purpose: string, qrSecret: string | null, message: string) => {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required');
  const key = Buffer.from(
    hkdfSync('sha256', secret, qrSecret ?? purpose, purpose, KEY_BYTES),
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

export const dineInTableToken = (
  organizationId: string,
  qrSecret: string | null,
  tableNumber: number,
) => sign(DINE_IN_TABLE_PURPOSE, qrSecret, `${organizationId}:${tableNumber}`);

export const isOpenDineInTable = (
  dineInTableCount: number | null,
  tableNumber: number | null | undefined,
) =>
  !!tableNumber && tableNumber >= 1 && tableNumber <= (dineInTableCount ?? 0);

export const orderModeToken = (
  organizationId: string,
  qrSecret: string | null,
  mode: ModeTokenOrderMode,
) => sign(ORDER_MODE_PURPOSE, qrSecret, `${organizationId}:${mode}`);

export const isValidQrToken = (
  organizationId: string,
  qrSecret: string | null,
  mode: QrOrderMode,
  tableNumber: number | undefined,
  token: string,
) => {
  if (mode !== 'dineIn')
    return isSameToken(orderModeToken(organizationId, qrSecret, mode), token);

  return (
    !!tableNumber &&
    isSameToken(dineInTableToken(organizationId, qrSecret, tableNumber), token)
  );
};

export type IssuedOrderQrSession = { session: OrderQrSession; value: string };

export const issueOrderQrSession = (
  organizationId: string,
  qrSecret: string | null,
  mode: QrOrderMode,
  tableNumber: number | null,
): IssuedOrderQrSession => {
  const expiresAt = new Date(Date.now() + ORDER_QR_SESSION_TTL_MS);
  const payload = Buffer.from(
    JSON.stringify([organizationId, mode, tableNumber, expiresAt.getTime()]),
  ).toString('base64url');

  return {
    session: { expiresAt, mode, tableNumber },
    value: `${payload}.${sign(ORDER_QR_SESSION_PURPOSE, qrSecret, payload)}`,
  };
};

export const verifyOrderQrSession = (
  organizationId: string,
  qrSecret: string | null,
  value: string | undefined,
): OrderQrSession | null => {
  const [payload, signature] = value?.split('.') ?? [];
  if (
    !payload ||
    !signature ||
    !isSameToken(sign(ORDER_QR_SESSION_PURPOSE, qrSecret, payload), signature)
  )
    return null;

  const [sessionOrganizationId, mode, tableNumber, expiresAt] = JSON.parse(
    Buffer.from(payload, 'base64url').toString(),
  ) as [string, QrOrderMode, number | null, number];

  if (sessionOrganizationId !== organizationId || expiresAt <= Date.now())
    return null;

  return { expiresAt: new Date(expiresAt), mode, tableNumber };
};

export const setOrderQrSessionCookie = (
  res: Response,
  { session, value }: IssuedOrderQrSession,
) =>
  res.cookie(ORDER_QR_SESSION_COOKIE, value, {
    expires: session.expiresAt,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
