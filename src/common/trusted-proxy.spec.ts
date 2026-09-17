import { trustedProxies } from './trusted-proxy';

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
