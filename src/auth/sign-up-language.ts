// https://better-auth.com/docs/concepts/oauth
// https://better-auth.com/docs/concepts/database#database-hooks

import { addOAuthServerContext, getOAuthState } from 'better-auth/api';

import { isLanguage, pickLanguage } from '../common/utils/language.js';
import type { Language } from '../db/schema/enums.js';

type EndpointContext = { path?: string; headers?: Headers } | null;

const requestLanguage = (context: EndpointContext) =>
  pickLanguage(context?.headers?.get('accept-language'));

// /sign-in/social 由前台 auth-client 發出，Accept-Language 是頁面語系；
// Google 轉址回 /callback 時瀏覽器只會帶自己的語系設定，所以先存進 OAuth state
export const rememberSignInLanguage = async (context: EndpointContext) => {
  const lang = requestLanguage(context);
  if (lang) await addOAuthServerContext({ lang });
};

// 用 OAuth 註冊的新使用者沒有 lang 欄位，依註冊當下的頁面語系設定；其他建立帳號的途徑會自己帶 lang 或用預設值
export const signUpLanguage = async (
  context: EndpointContext,
): Promise<Language | undefined> => {
  if (context?.path === '/sign-in/social') return requestLanguage(context);
  if (!context?.path?.startsWith('/callback/')) return undefined;

  const lang = (await getOAuthState())?.serverContext?.lang;

  return isLanguage(lang) ? lang : requestLanguage(context);
};
