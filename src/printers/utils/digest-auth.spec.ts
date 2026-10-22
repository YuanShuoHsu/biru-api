import { createHash } from 'node:crypto';

import {
  DIGEST_REALM,
  digestChallenge,
  digestHa1,
  parseDigestAuthorization,
  verifyDigest,
} from './digest-auth.js';

const md5 = (value: string) => createHash('md5').update(value).digest('hex');

const URI = '/api/invoice-printers/server-direct-print';

// 依 RFC 7616 自行計算客戶端回應，模擬印表機
const authorize = (
  password: string,
  nonce: string,
  overrides: Record<string, string> = {},
) => {
  const ha1 = md5(`biru-printer:${DIGEST_REALM}:${password}`);
  const ha2 = md5(`POST:${URI}`);
  const response = md5(`${ha1}:${nonce}:00000001:abc:auth:${ha2}`);

  return {
    cnonce: 'abc',
    nc: '00000001',
    nonce,
    qop: 'auth',
    realm: DIGEST_REALM,
    response,
    uri: URI,
    username: 'biru-printer',
    ...overrides,
  };
};

const nonceOf = (challenge: string) => /nonce="([^"]+)"/.exec(challenge)![1];

describe('Digest 認證', () => {
  const ha1 = digestHa1('biru-printer', 'secret');

  beforeAll(() => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('密碼正確才通過', () => {
    const nonce = nonceOf(digestChallenge());

    expect(verifyDigest(authorize('secret', nonce), 'POST', ha1)).toBe('valid');
    expect(verifyDigest(authorize('wrong', nonce), 'POST', ha1)).toBe(
      'invalid',
    );
  });

  it('不是伺服器簽發的 nonce 一律拒絕', () => {
    expect(
      verifyDigest(authorize('secret', '1.salt.forged'), 'POST', ha1),
    ).toBe('invalid');
  });

  it('nonce 過期但密碼正確時回 stale，讓印表機換 nonce 重送', () => {
    vi.useFakeTimers();
    const nonce = nonceOf(digestChallenge());
    vi.advanceTimersByTime(6 * 60 * 1000);

    expect(verifyDigest(authorize('secret', nonce), 'POST', ha1)).toBe('stale');
    expect(verifyDigest(authorize('wrong', nonce), 'POST', ha1)).toBe(
      'invalid',
    );
    vi.useRealTimers();
  });

  it('沒帶 qop=auth 的舊式回應一律拒絕', () => {
    const nonce = nonceOf(digestChallenge());
    const response = md5(`${ha1}:${nonce}:${md5(`POST:${URI}`)}`);

    expect(
      verifyDigest(
        { nonce, realm: DIGEST_REALM, response, uri: URI },
        'POST',
        ha1,
      ),
    ).toBe('invalid');
  });

  it('realm 不符或換了請求方法都會失敗', () => {
    const nonce = nonceOf(digestChallenge());

    expect(
      verifyDigest(authorize('secret', nonce, { realm: 'other' }), 'POST', ha1),
    ).toBe('invalid');
    expect(verifyDigest(authorize('secret', nonce), 'GET', ha1)).toBe(
      'invalid',
    );
  });

  it('解析 Authorization 標頭的帶引號與不帶引號參數', () => {
    expect(
      parseDigestAuthorization(
        'Digest username="biru-printer", realm="r", nonce="n", uri="/a", qop=auth, nc=00000001, cnonce="c", response="x"',
      ),
    ).toEqual({
      cnonce: 'c',
      nc: '00000001',
      nonce: 'n',
      qop: 'auth',
      realm: 'r',
      response: 'x',
      uri: '/a',
      username: 'biru-printer',
    });
    expect(parseDigestAuthorization('Basic abc')).toBeNull();
  });
});
