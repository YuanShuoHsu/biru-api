import { User } from '@prisma/client';

import type { Request } from 'express';

export interface JwtPayload {
  email: string;
  sub: string;
}

export interface RequestWithUser extends Request {
  user: User;
}
