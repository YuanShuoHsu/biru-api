import type { Response } from 'express';

import { isSameToken, sign } from '../orders/order-qr-token.js';

const SHARED_CART_PARTICIPANT_PURPOSE = 'biru-shared-cart-participant-v1';

export const SHARED_CART_TTL_MS = 2 * 60 * 60 * 1000;

export const sharedCartParticipantCookie = (organizationId: string) =>
  `biru_shared_cart_participant_${Buffer.from(organizationId).toString('base64url')}`;

export type SharedCartParticipantSession = {
  participantId: string;
  sharedCartId: string;
};

export type IssuedSharedCartParticipant = {
  name: string;
  session: SharedCartParticipantSession;
  value: string;
};

export const issueSharedCartParticipant = (
  organizationId: string,
  qrSecret: string | null,
  sharedCartId: string,
  participantId: string,
): IssuedSharedCartParticipant => {
  const payload = Buffer.from(
    JSON.stringify([organizationId, sharedCartId, participantId]),
  ).toString('base64url');

  return {
    name: sharedCartParticipantCookie(organizationId),
    session: { participantId, sharedCartId },
    value: `${payload}.${sign(SHARED_CART_PARTICIPANT_PURPOSE, qrSecret, payload)}`,
  };
};

export const verifySharedCartParticipant = (
  organizationId: string,
  qrSecret: string | null,
  value: unknown,
): SharedCartParticipantSession | null => {
  if (typeof value !== 'string') return null;

  const [payload, signature, ...rest] = value.split('.');
  if (
    !payload ||
    !signature ||
    rest.length ||
    !isSameToken(
      sign(SHARED_CART_PARTICIPANT_PURPOSE, qrSecret, payload),
      signature,
    )
  )
    return null;

  const [sessionOrganizationId, sharedCartId, participantId] = JSON.parse(
    Buffer.from(payload, 'base64url').toString(),
  ) as [string, string, string];

  if (sessionOrganizationId !== organizationId) return null;

  return { participantId, sharedCartId };
};

const cookieOptions = () =>
  ({
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  }) as const;

// 不設 expires：效期只看資料庫的 last_activity_at，cookie 比群組早過期會讓同一人重複佔位
export const setSharedCartParticipantCookie = (
  res: Response,
  { name, value }: IssuedSharedCartParticipant,
) => res.cookie(name, value, cookieOptions());

export const clearSharedCartParticipantCookie = (res: Response, name: string) =>
  res.clearCookie(name, cookieOptions());
