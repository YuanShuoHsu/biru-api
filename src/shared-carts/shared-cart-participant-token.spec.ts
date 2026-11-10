import type { Response } from 'express';

import {
  issueSharedCartParticipant,
  SHARED_CART_PARTICIPANT_COOKIE,
  setSharedCartParticipantCookie,
  verifySharedCartParticipant,
} from './shared-cart-participant-token.js';

describe('shared cart participant cookie', () => {
  beforeEach(() => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('verifies an issued participant until it expires', () => {
    vi.useFakeTimers({ now: new Date('2026-11-10T04:00:00Z') });
    const { session, value } = issueSharedCartParticipant(
      'org',
      'secret',
      'cart',
      'participant',
    );

    expect(session).toEqual({
      expiresAt: new Date('2026-11-10T06:00:00Z'),
      participantId: 'participant',
      sharedCartId: 'cart',
    });
    expect(verifySharedCartParticipant('org', 'secret', value)).toEqual(
      session,
    );

    vi.setSystemTime(session.expiresAt);
    expect(verifySharedCartParticipant('org', 'secret', value)).toBeNull();
  });

  it.each([
    ['another organization', 'other', 'secret'],
    ['a rotated secret', 'org', 'rotated'],
  ])('rejects %s', (_, organizationId, qrSecret) => {
    const { value } = issueSharedCartParticipant('org', 'secret', 'c', 'p');
    expect(
      verifySharedCartParticipant(organizationId, qrSecret, value),
    ).toBeNull();
  });

  it('rejects a payload swapped to another participant', () => {
    const { value } = issueSharedCartParticipant('org', null, 'c', 'p');
    const [, signature] = value.split('.');
    const forged = Buffer.from(
      JSON.stringify(['org', 'c', 'other', Date.now() + 60_000]),
    ).toString('base64url');

    expect(
      verifySharedCartParticipant('org', null, `${forged}.${signature}`),
    ).toBeNull();
  });

  it.each([
    ['a missing cookie', undefined],
    ['a non-string cookie', { value: 'x' }],
    ['a malformed cookie', 'not-a-session'],
    ['a tampered signature', (v: string) => `${v.slice(0, -1)}x`],
    ['extra segments', (v: string) => `${v}.extra`],
  ])('returns null for %s', (_, value) => {
    const { value: issued } = issueSharedCartParticipant('org', null, 'c', 'p');
    expect(
      verifySharedCartParticipant(
        'org',
        null,
        typeof value === 'function' ? value(issued) : value,
      ),
    ).toBeNull();
  });

  it('sets an httpOnly lax cookie that expires with the session', () => {
    const cookie = vi.fn();
    const issued = issueSharedCartParticipant('org', null, 'c', 'p');

    setSharedCartParticipantCookie({ cookie } as unknown as Response, issued);

    expect(cookie).toHaveBeenCalledWith(
      SHARED_CART_PARTICIPANT_COOKIE,
      issued.value,
      {
        expires: issued.session.expiresAt,
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure: false,
      },
    );
  });
});
