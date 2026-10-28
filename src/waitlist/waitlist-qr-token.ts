import type { Response } from 'express';

import { isSameToken, sign } from '../orders/order-qr-token.js';

const WAITLIST_PURPOSE = 'biru-waitlist-v1';
const WAITLIST_QR_SESSION_PURPOSE = 'biru-waitlist-qr-session-v1';
const WAITLIST_QR_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export const WAITLIST_QR_SESSION_COOKIE = 'biru_waitlist_qr_session';

export type WaitlistQrSession = { expiresAt: Date };

export type IssuedWaitlistQrSession = {
  session: WaitlistQrSession;
  value: string;
};

export const waitlistQrToken = (
  organizationId: string,
  qrSecret: string | null,
) => sign(WAITLIST_PURPOSE, qrSecret, organizationId);

export const isValidWaitlistQrToken = (
  organizationId: string,
  qrSecret: string | null,
  token: string,
) => isSameToken(waitlistQrToken(organizationId, qrSecret), token);

export const issueWaitlistQrSession = (
  organizationId: string,
  qrSecret: string | null,
): IssuedWaitlistQrSession => {
  const expiresAt = new Date(Date.now() + WAITLIST_QR_SESSION_TTL_MS);
  const payload = Buffer.from(
    JSON.stringify([organizationId, expiresAt.getTime()]),
  ).toString('base64url');

  return {
    session: { expiresAt },
    value: `${payload}.${sign(WAITLIST_QR_SESSION_PURPOSE, qrSecret, payload)}`,
  };
};

export const verifyWaitlistQrSession = (
  organizationId: string,
  qrSecret: string | null,
  value: unknown,
): WaitlistQrSession | null => {
  if (typeof value !== 'string') return null;

  const [payload, signature, ...rest] = value.split('.');
  if (
    !payload ||
    !signature ||
    rest.length ||
    !isSameToken(
      sign(WAITLIST_QR_SESSION_PURPOSE, qrSecret, payload),
      signature,
    )
  )
    return null;

  const [sessionOrganizationId, expiresAt] = JSON.parse(
    Buffer.from(payload, 'base64url').toString(),
  ) as [string, number];

  if (sessionOrganizationId !== organizationId || !(expiresAt > Date.now()))
    return null;

  return { expiresAt: new Date(expiresAt) };
};

export const setWaitlistQrSessionCookie = (
  res: Response,
  { session, value }: IssuedWaitlistQrSession,
) =>
  res.cookie(WAITLIST_QR_SESSION_COOKIE, value, {
    expires: session.expiresAt,
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
