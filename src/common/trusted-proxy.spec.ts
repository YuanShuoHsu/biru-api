import { clientIp, trustedProxies } from './trusted-proxy.js';

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
