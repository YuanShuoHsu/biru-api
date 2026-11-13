import type { Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearSiteCookie, setSiteCookie } from './cookies.js';

const mockResponse = () => {
  const cookie = vi.fn();
  const clearCookie = vi.fn();
  return {
    clearCookie,
    cookie,
    res: { clearCookie, cookie } as unknown as Response,
  };
};

const hostOnly = (secure: boolean) => ({
  httpOnly: true,
  path: '/',
  sameSite: 'lax',
  secure,
});

describe('site cookies', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps cookies host-only outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { clearCookie, cookie, res } = mockResponse();
    const expires = new Date('2026-11-13T00:00:00Z');

    setSiteCookie(res, 'name', 'value', expires);
    clearSiteCookie(res, 'name');

    expect(cookie).toHaveBeenCalledExactlyOnceWith('name', 'value', {
      ...hostOnly(false),
      expires,
    });
    expect(clearCookie).toHaveBeenCalledExactlyOnceWith(
      'name',
      hostOnly(false),
    );
  });

  it('scopes cookies to the parent domain in production and clears them with the same options', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { clearCookie, cookie, res } = mockResponse();
    const crossSubDomain = { ...hostOnly(true), domain: '.birucoffee.com' };

    setSiteCookie(res, 'name', 'value');
    clearSiteCookie(res, 'name');

    expect(cookie).toHaveBeenCalledExactlyOnceWith(
      'name',
      'value',
      crossSubDomain,
    );
    expect(clearCookie).toHaveBeenCalledExactlyOnceWith('name', crossSubDomain);
  });
});
