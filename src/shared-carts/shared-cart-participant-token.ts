import type { Response } from 'express';

import { isSameToken, sign } from '../orders/order-qr-token.js';

const SHARED_CART_PARTICIPANT_PURPOSE = 'biru-shared-cart-participant-v1';

export const SHARED_CART_TTL_MS = 2 * 60 * 60 * 1000;

export const SHARED_CART_PARTICIPANT_COOKIE = 'biru_shared_cart_participant';

export type SharedCartParticipantSession = {
  expiresAt: Date;
  participantId: string;
  sharedCartId: string;
};

export type IssuedSharedCartParticipant = {
  session: SharedCartParticipantSession;
  value: string;
};

export const issueSharedCartParticipant = (
  organizationId: string,
  qrSecret: string | null,
  sharedCartId: string,
  participantId: string,
): IssuedSharedCartParticipant => {
  const expiresAt = new Date(Date.now() + SHARED_CART_TTL_MS);
  const payload = Buffer.from(
    JSON.stringify([
      organizationId,
      sharedCartId,
      participantId,
      expiresAt.getTime(),
    ]),
  ).toString('base64url');

  return {
    session: { expiresAt, participantId, sharedCartId },
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

  const [sessionOrganizationId, sharedCartId, participantId, expiresAt] =
    JSON.parse(Buffer.from(payload, 'base64url').toString()) as [
      string,
      string,
      string,
      number,
    ];

  if (sessionOrganizationId !== organizationId || !(expiresAt > Date.now()))
    return null;

  return { expiresAt: new Date(expiresAt), participantId, sharedCartId };
};

const cookieOptions = () =>
  ({
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  }) as const;

export const setSharedCartParticipantCookie = (
  res: Response,
  { session, value }: IssuedSharedCartParticipant,
) =>
  res.cookie(SHARED_CART_PARTICIPANT_COOKIE, value, {
    ...cookieOptions(),
    expires: session.expiresAt,
  });

export const clearSharedCartParticipantCookie = (res: Response) =>
  res.clearCookie(SHARED_CART_PARTICIPANT_COOKIE, cookieOptions());
