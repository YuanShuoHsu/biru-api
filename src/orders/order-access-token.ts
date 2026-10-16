import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

const KEY_BYTES = 32;
const KEY_PURPOSE = 'biru-order-access-v1';

const signingKey = () => {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required');
  return Buffer.from(
    hkdfSync('sha256', secret, KEY_PURPOSE, KEY_PURPOSE, KEY_BYTES),
  );
};

export const orderAccessToken = (orderId: string) =>
  createHmac('sha256', signingKey()).update(orderId).digest('base64url');

export const isValidOrderAccessToken = (
  orderId: string,
  token: string | null | undefined,
) => {
  if (!token) return false;
  const expected = Buffer.from(orderAccessToken(orderId));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};
