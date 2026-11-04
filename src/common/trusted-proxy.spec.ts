import {
  clientIp,
  forwardedClientIp,
  trustedProxies,
} from './trusted-proxy.js';

describe('trustedProxies', () => {
  it('fails closed when nothing is configured', () => {
    expect(trustedProxies(undefined)).toBe(false);
    expect(trustedProxies('')).toBe(false);
    expect(trustedProxies('  ,  ')).toBe(false);
  });
  it('accepts addresses, CIDRs and proxy-addr presets', () => {
    expect(trustedProxies('10.0.0.0/8, uniquelocal ,::1')).toEqual([
      '10.0.0.0/8',
      'uniquelocal',
      '::1',
    ]);
  });
  it('rejects a prefix that would trust every forwarded address', () => {
    expect(() => trustedProxies('0.0.0.0/0')).toThrow('TRUSTED_PROXIES');
    expect(() => trustedProxies('::/0')).toThrow('TRUSTED_PROXIES');
  });
  it('rejects values proxy-addr would silently ignore', () => {
    expect(() => trustedProxies('true')).toThrow('TRUSTED_PROXIES');
    expect(() => trustedProxies('1')).toThrow('TRUSTED_PROXIES');
    expect(() => trustedProxies('10.0.0.1/8/8')).toThrow('TRUSTED_PROXIES');
    expect(() => trustedProxies('10.0.0.1/33')).toThrow('TRUSTED_PROXIES');
    expect(() => trustedProxies('::1/129')).toThrow('TRUSTED_PROXIES');
  });
});

describe('clientIp', () => {
  const req = (headers: Record<string, string | string[]> = {}) => ({
    headers,
    ip: '10.0.0.1',
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['', '  '])('uses req.ip when CLIENT_IP_HEADER is %j', (value) => {
    vi.stubEnv('CLIENT_IP_HEADER', value);
    expect(clientIp(req({ 'cf-connecting-ip': '203.0.113.9' }))).toBe(
      '10.0.0.1',
    );
  });

  it('reads the configured header case-insensitively', () => {
    vi.stubEnv('CLIENT_IP_HEADER', ' CF-Connecting-IP ');
    expect(clientIp(req({ 'cf-connecting-ip': '203.0.113.9' }))).toBe(
      '203.0.113.9',
    );
    expect(clientIp(req({ 'cf-connecting-ip': '2001:db8::1' }))).toBe(
      '2001:db8::1',
    );
  });

  it.each([
    ['missing', {}],
    ['empty', { 'cf-connecting-ip': '' }],
    ['not an IP', { 'cf-connecting-ip': 'unknown' }],
    ['a list', { 'cf-connecting-ip': '203.0.113.9, 10.0.0.1' }],
    ['an IPv6 with a zone id', { 'cf-connecting-ip': 'fe80::1%eth0' }],
    ['repeated', { 'cf-connecting-ip': ['203.0.113.9', '203.0.113.10'] }],
  ])(
    'never falls back to req.ip or X-Forwarded-For when the header is %s',
    (_, headers) => {
      vi.stubEnv('CLIENT_IP_HEADER', 'CF-Connecting-IP');
      expect(
        clientIp(req({ ...headers, 'x-forwarded-for': '203.0.113.9' })),
      ).toBeUndefined();
    },
  );
});

describe('forwardedClientIp', () => {
  const secret = 'forward-secret-0123456789abcdef';
  const req = (headers: Record<string, string | string[]> = {}) => ({
    headers: { 'cf-connecting-ip': '198.51.100.7', ...headers },
    ip: '10.0.0.1',
  });
  const signed = (ip: string | string[], sent = secret) =>
    req({ 'x-forwarded-client-ip': ip, 'x-client-ip-forward-secret': sent });

  beforeEach(() => {
    vi.stubEnv('CLIENT_IP_HEADER', 'CF-Connecting-IP');
    vi.stubEnv('CLIENT_IP_FORWARD_SECRET', secret);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the forwarded IP when the secret matches', () => {
    expect(forwardedClientIp(signed('203.0.113.9'))).toBe('203.0.113.9');
    expect(forwardedClientIp(signed('2001:db8::1'))).toBe('2001:db8::1');
  });

  it('never changes what clientIp returns, so the punch allowlist ignores it', () => {
    expect(clientIp(signed('203.0.113.9'))).toBe('198.51.100.7');
  });

  it.each([
    ['a wrong secret', signed('203.0.113.9', 'guess')],
    ['a secret with a different length', signed('203.0.113.9', `${secret}x`)],
    ['no secret', req({ 'x-forwarded-client-ip': '203.0.113.9' })],
  ])('ignores the forwarded IP with %s', (_, request) => {
    expect(forwardedClientIp(request)).toBeUndefined();
  });

  it('ignores a signed request when no secret is configured', () => {
    vi.stubEnv('CLIENT_IP_FORWARD_SECRET', '  ');
    expect(forwardedClientIp(signed('203.0.113.9', '  '))).toBeUndefined();
    expect(forwardedClientIp(signed('203.0.113.9', ''))).toBeUndefined();
  });

  it.each([
    ['missing', undefined],
    ['not an IP', 'unknown'],
    ['a list', '203.0.113.9, 10.0.0.1'],
    ['an IPv6 with a zone id', 'fe80::1%eth0'],
    ['repeated', ['203.0.113.9', '203.0.113.10']],
  ])('returns nothing when the forwarded IP is %s', (_, ip) => {
    expect(
      forwardedClientIp(
        ip === undefined
          ? req({ 'x-client-ip-forward-secret': secret })
          : signed(ip),
      ),
    ).toBeUndefined();
  });
});
