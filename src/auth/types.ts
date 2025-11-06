import { User } from '@prisma/client';

import type { Request } from 'express';

export interface JwtPayload {
  sub: string;
  email: string;
}

export interface GoogleUserPayload {
  accessToken: string;
  accessTokenExpiresAt: Date;
  accountId: string;
  email: string;
  emailVerified?: boolean;
  firstName?: string;
  idToken: string;
  image?: string;
  lastName?: string;
  refreshToken?: string;
  scope: string;
}

export type RequestWithUser = Request & { user: User };

export type RefreshUser = User & { refreshToken: string };
export type RequestWithRefreshUser = Request & { user: RefreshUser };

export type RequestWithGoogleUser = Request & { user: GoogleUserPayload };

export type RequestWithCookies = Omit<Request, 'cookies'> & {
  cookies: Record<string, string>;
};
