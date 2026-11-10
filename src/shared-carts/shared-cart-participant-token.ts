import { randomBytes } from 'node:crypto';

import type { Response } from 'express';

import { isSameToken, sign } from '../orders/order-qr-token.js';

const SHARED_CART_DEVICE_PURPOSE = 'biru-shared-cart-device-v1';

export const sharedCartParticipantCookie = (organizationId: string) =>
  `biru_shared_cart_participant_${Buffer.from(organizationId).toString('base64url')}`;

export const newSharedCartDeviceKey = () =>
  randomBytes(32).toString('base64url');

export type IssuedSharedCartParticipant = {
  deviceKey: string;
  name: string;
  value: string;
};

export const issueSharedCartParticipant = (
  organizationId: string,
  qrSecret: string | null,
  deviceKey: string,
): IssuedSharedCartParticipant => {
  const payload = Buffer.from(
    JSON.stringify([organizationId, deviceKey]),
  ).toString('base64url');

  return {
    deviceKey,
    name: sharedCartParticipantCookie(organizationId),
    value: `${payload}.${sign(SHARED_CART_DEVICE_PURPOSE, qrSecret, payload)}`,
  };
};

export const verifySharedCartParticipant = (
  organizationId: string,
  qrSecret: string | null,
  value: unknown,
): string | null => {
  if (typeof value !== 'string') return null;

  const [payload, signature, ...rest] = value.split('.');
  if (
    !payload ||
    !signature ||
    rest.length ||
    !isSameToken(sign(SHARED_CART_DEVICE_PURPOSE, qrSecret, payload), signature)
  )
    return null;

  const [sessionOrganizationId, deviceKey] = JSON.parse(
    Buffer.from(payload, 'base64url').toString(),
  ) as [string, string];

  return sessionOrganizationId === organizationId ? deviceKey : null;
};

const cookieOptions = () =>
  ({
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  }) as const;

// 不設 expires：效期只看資料庫裡群組最後操作的時間，cookie 比群組早過期會讓同一人重複佔位
export const setSharedCartParticipantCookie = (
  res: Response,
  { name, value }: IssuedSharedCartParticipant,
) => res.cookie(name, value, cookieOptions());

export const clearSharedCartParticipantCookie = (res: Response, name: string) =>
  res.clearCookie(name, cookieOptions());
