import type { CookieOptions, Response } from 'express';

// https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies#define_where_cookies_are_sent
// 網域須與 better-auth 的 crossSubDomainCookies 相同：前台經 rewrite 設下的 cookie，瀏覽器直連 API 時才帶得到
// 改變既有 cookie 的網域時要一併換名：瀏覽器裡舊網域的同名 cookie 會排在前面送出，cookie-parser 只留第一個
const CROSS_SUB_DOMAIN = '.birucoffee.com';

const cookieOptions = (): CookieOptions => {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: isProduction,
    ...(isProduction && { domain: CROSS_SUB_DOMAIN }),
  };
};

export const setSiteCookie = (
  res: Response,
  name: string,
  value: string,
  expires?: Date,
) =>
  res.cookie(name, value, { ...cookieOptions(), ...(expires && { expires }) });

export const clearSiteCookie = (res: Response, name: string) =>
  res.clearCookie(name, cookieOptions());
