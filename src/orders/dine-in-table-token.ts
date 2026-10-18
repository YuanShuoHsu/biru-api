import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

const KEY_BYTES = 32;
const KEY_PURPOSE = 'biru-dine-in-table-v1';

const signingKey = () => {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required');
  return Buffer.from(
    hkdfSync('sha256', secret, KEY_PURPOSE, KEY_PURPOSE, KEY_BYTES),
  );
};

export const dineInTableToken = (organizationId: string, tableNumber: number) =>
  createHmac('sha256', signingKey())
    .update(`${organizationId}:${tableNumber}`)
    .digest('base64url');

export const isValidDineInTableToken = (
  organizationId: string,
  tableNumber: number | undefined,
  token: string | undefined,
) => {
  if (!tableNumber || !token) return false;
  const expected = Buffer.from(dineInTableToken(organizationId, tableNumber));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};
