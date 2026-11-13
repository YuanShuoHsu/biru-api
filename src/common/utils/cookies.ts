import type { CookieOptions, Response } from 'express';

// https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies#define_where_cookies_are_sent
// 網域須與 better-auth 的 crossSubDomainCookies 相同：前台經 rewrite 設下的 cookie，瀏覽器直連 API 時才帶得到
const CROSS_SUB_DOMAIN = '.birucoffee.com';

const isProduction = () => process.env.NODE_ENV === 'production';

const hostOnlyOptions = (): CookieOptions => ({
  httpOnly: true,
  path: '/',
  sameSite: 'lax',
  secure: isProduction(),
});

const cookieOptions = (): CookieOptions =>
  isProduction()
    ? { ...hostOnlyOptions(), domain: CROSS_SUB_DOMAIN }
    : hostOnlyOptions();

// 先前未帶網域設下的同名 cookie 建立得較早，會排在前面送出而蓋過網域 cookie
const clearHostOnlyCookie = (res: Response, name: string) => {
  if (isProduction()) res.clearCookie(name, hostOnlyOptions());
};

export const setSiteCookie = (
  res: Response,
  name: string,
  value: string,
  expires?: Date,
) => {
  clearHostOnlyCookie(res, name);
  res.cookie(name, value, { ...cookieOptions(), ...(expires && { expires }) });
};

export const clearSiteCookie = (res: Response, name: string) => {
  clearHostOnlyCookie(res, name);
  res.clearCookie(name, cookieOptions());
};
