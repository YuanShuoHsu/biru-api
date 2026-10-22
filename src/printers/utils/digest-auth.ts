import {
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

// RFC 7616 Digest（MD5、qop=auth）；Epson Server Direct Print 只支援這種認證
export const DIGEST_REALM = 'biru-invoice-printer';

const KEY_BYTES = 32;
const KEY_PURPOSE = 'biru-invoice-printer-nonce-v1';
const NONCE_TTL_MS = 5 * 60 * 1000;

const md5 = (value: string) => createHash('md5').update(value).digest('hex');

const signingKey = () => {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required');
  return Buffer.from(
    hkdfSync('sha256', secret, KEY_PURPOSE, KEY_PURPOSE, KEY_BYTES),
  );
};

const signNonce = (issuedAt: string, salt: string) =>
  createHmac('sha256', signingKey())
    .update(`${issuedAt}:${salt}`)
    .digest('base64url');

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const digestHa1 = (username: string, password: string) =>
  md5(`${username}:${DIGEST_REALM}:${password}`);

const createNonce = () => {
  const issuedAt = String(Date.now());
  const salt = randomBytes(8).toString('base64url');
  return `${issuedAt}.${salt}.${signNonce(issuedAt, salt)}`;
};

export const nonceIssuedAt = (nonce: string) => Number(nonce.split('.')[0]);

const nonceState = (nonce: string): 'valid' | 'stale' | 'invalid' => {
  const [issuedAt, salt, signature] = nonce.split('.');
  if (!issuedAt || !salt || !signature) return 'invalid';
  if (!safeEqual(signature, signNonce(issuedAt, salt))) return 'invalid';
  return Date.now() - Number(issuedAt) > NONCE_TTL_MS ? 'stale' : 'valid';
};

export const digestChallenge = (stale = false) =>
  `Digest realm="${DIGEST_REALM}", qop="auth", algorithm=MD5, nonce="${createNonce()}"${stale ? ', stale=true' : ''}`;

export const parseDigestAuthorization = (
  header: string | undefined,
): Record<string, string> | null => {
  if (!header?.startsWith('Digest ')) return null;

  const params: Record<string, string> = {};
  for (const [, key, quoted, bare] of header
    .slice('Digest '.length)
    .matchAll(/([a-zA-Z]+)=(?:"([^"]*)"|([^,\s]*))/g))
    params[key.toLowerCase()] = quoted ?? bare;

  return params;
};

export type DigestVerification = 'valid' | 'stale' | 'invalid';

export const verifyDigest = (
  params: Record<string, string>,
  method: string,
  ha1: string,
): DigestVerification => {
  const { cnonce, nc, nonce, qop, response, uri } = params;
  if (
    !nonce ||
    !response ||
    !uri ||
    qop !== 'auth' ||
    !cnonce ||
    !/^[0-9a-f]{8}$/i.test(nc ?? '') ||
    params.realm !== DIGEST_REALM
  )
    return 'invalid';

  const state = nonceState(nonce);
  if (state === 'invalid') return 'invalid';

  const ha2 = md5(`${method}:${uri}`);
  const expected = md5(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`);

  if (!safeEqual(response, expected)) return 'invalid';

  // 簽章正確但 nonce 過期，回 stale 讓印表機換新 nonce 重送，不必重輸密碼
  return state;
};
