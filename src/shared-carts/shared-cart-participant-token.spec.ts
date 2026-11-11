import type { Response } from 'express';

import {
  clearSharedCartParticipantCookie,
  issueSharedCartParticipant,
  issueSharedCartSocketToken,
  newSharedCartDeviceKey,
  setSharedCartParticipantCookie,
  sharedCartParticipantCookie,
  verifySharedCartParticipant,
  verifySharedCartSocketToken,
} from './shared-cart-participant-token.js';

describe('shared cart participant cookie', () => {
  beforeEach(() => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('verifies an issued device key without an expiry of its own', () => {
    vi.useFakeTimers({ now: new Date('2026-11-10T04:00:00Z') });
    const issued = issueSharedCartParticipant('org', 'secret', 'device');

    expect(issued.deviceKey).toBe('device');
    vi.setSystemTime(new Date('2026-11-20T04:00:00Z'));
    expect(verifySharedCartParticipant('org', 'secret', issued.value)).toBe(
      'device',
    );
  });

  it('mints a random 32-byte device key', () => {
    const key = newSharedCartDeviceKey();
    expect(Buffer.from(key, 'base64url')).toHaveLength(32);
    expect(newSharedCartDeviceKey()).not.toBe(key);
  });

  it('names the cookie per store with cookie-safe characters', () => {
    expect(sharedCartParticipantCookie('aB3')).toBe(
      'biru_shared_cart_participant_YUIz',
    );
    expect(sharedCartParticipantCookie('a b;(c)')).toMatch(
      /^biru_shared_cart_participant_[A-Za-z0-9_-]+$/,
    );
    expect(sharedCartParticipantCookie('org-a')).not.toBe(
      sharedCartParticipantCookie('org-b'),
    );
    expect(issueSharedCartParticipant('org', null, 'device').name).toBe(
      sharedCartParticipantCookie('org'),
    );
  });

  it.each([
    ['another organization', 'other', 'secret'],
    ['a rotated secret', 'org', 'rotated'],
  ])('rejects %s', (_, organizationId, qrSecret) => {
    const { value } = issueSharedCartParticipant('org', 'secret', 'device');
    expect(
      verifySharedCartParticipant(organizationId, qrSecret, value),
    ).toBeNull();
  });

  it('rejects a payload swapped to another device', () => {
    const { value } = issueSharedCartParticipant('org', null, 'device');
    const [, signature] = value.split('.');
    const forged = Buffer.from(JSON.stringify(['org', 'other'])).toString(
      'base64url',
    );

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
    const { value: issued } = issueSharedCartParticipant('org', null, 'device');
    expect(
      verifySharedCartParticipant(
        'org',
        null,
        typeof value === 'function' ? value(issued) : value,
      ),
    ).toBeNull();
  });

  it('sets an httpOnly lax browser-session cookie', () => {
    const cookie = vi.fn();
    const issued = issueSharedCartParticipant('org', null, 'device');

    setSharedCartParticipantCookie({ cookie } as unknown as Response, issued);

    expect(cookie).toHaveBeenCalledWith(issued.name, issued.value, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: false,
    });
  });

  it('clears the named cookie with the same options', () => {
    const clearCookie = vi.fn();

    clearSharedCartParticipantCookie(
      { clearCookie } as unknown as Response,
      'name',
    );

    expect(clearCookie).toHaveBeenCalledWith('name', {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: false,
    });
  });
});

describe('shared cart socket token', () => {
  beforeEach(() => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('carries the device key of its store until it expires', () => {
    vi.useFakeTimers({ now: new Date('2026-11-10T04:00:00Z') });
    const token = issueSharedCartSocketToken('org', 'secret', 'device', 1000);

    expect(verifySharedCartSocketToken('org', 'secret', token)).toBe('device');
    expect(verifySharedCartSocketToken('other', 'secret', token)).toBeNull();
    expect(verifySharedCartSocketToken('org', 'rotated', token)).toBeNull();
    vi.advanceTimersByTime(1000);
    expect(verifySharedCartSocketToken('org', 'secret', token)).toBeNull();
  });

  it('is not interchangeable with the participant cookie', () => {
    const token = issueSharedCartSocketToken('org', 'secret', 'device', 1000);
    const cookie = issueSharedCartParticipant('org', 'secret', 'device').value;

    expect(verifySharedCartParticipant('org', 'secret', token)).toBeNull();
    expect(verifySharedCartSocketToken('org', 'secret', cookie)).toBeNull();
  });
});
