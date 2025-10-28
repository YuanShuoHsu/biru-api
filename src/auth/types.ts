import { User } from '@prisma/client';

import type { Request } from 'express';

export interface JwtPayload {
  email: string;
  sub: string;
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

export interface RequestWithUser extends Request {
  user: User;
}

export type RequestWithGoogleUser = Request & { user: GoogleUserPayload };

export type RequestWithCookies = Omit<Request, 'cookies'> & {
  cookies: Record<string, string>;
};
