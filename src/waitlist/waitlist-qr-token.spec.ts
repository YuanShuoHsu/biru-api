import {
  isValidWaitlistQrToken,
  issueWaitlistQrSession,
  verifyWaitlistQrSession,
  waitlistQrToken,
} from './waitlist-qr-token.js';

describe('waitlist QR token', () => {
  beforeEach(() => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('accepts the token printed for the organization', () => {
    const token = waitlistQrToken('org', 'secret');
    expect(isValidWaitlistQrToken('org', 'secret', token)).toBe(true);
  });

  it.each([
    ['another organization', 'other', 'secret', (t: string) => t],
    ['a rotated secret', 'org', 'rotated', (t: string) => t],
    ['a tampered token', 'org', 'secret', (t: string) => `${t.slice(0, -1)}x`],
    ['an empty token', 'org', 'secret', () => ''],
  ])('rejects %s', (_, organizationId, qrSecret, tamper) => {
    const token = tamper(waitlistQrToken('org', 'secret'));
    expect(isValidWaitlistQrToken(organizationId, qrSecret, token)).toBe(false);
  });

  it('verifies an issued session until it expires', () => {
    vi.useFakeTimers({ now: new Date('2026-10-06T04:00:00Z') });
    const { expiresAt, value } = issueWaitlistQrSession('org', null);

    expect(verifyWaitlistQrSession('org', null, value)).toEqual({ expiresAt });

    vi.setSystemTime(expiresAt);
    expect(verifyWaitlistQrSession('org', null, value)).toBeNull();
  });

  it.each([
    ['a missing cookie', undefined],
    ['a non-string cookie', { value: 'x' }],
    ['a malformed cookie', 'not-a-session'],
    ['an unsigned payload', `${Buffer.from('{').toString('base64url')}.sig`],
    ['extra segments', 'a.b.c'],
  ])('returns null for %s', (_, value) => {
    expect(verifyWaitlistQrSession('org', null, value)).toBeNull();
  });
});
