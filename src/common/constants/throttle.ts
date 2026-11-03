import type { ExecutionContext } from '@nestjs/common';
import {
  minutes,
  normalizeIp,
  type ThrottlerGetTrackerFunction,
  type ThrottlerOptions,
} from '@nestjs/throttler';
import type { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';

import type { Auth } from '../../auth/index.js';
import { clientIp, clientIpHeader, trustedProxies } from '../trusted-proxy.js';

export const ANONYMOUS_THROTTLER = 'anonymous';
export const HOURLY_THROTTLER = 'hourly';

const skipIf = (context: ExecutionContext) =>
  context.getType() !== 'http' || (!clientIpHeader() && !trustedProxies());

const perRouteOnly: Omit<ThrottlerOptions, 'name'> = {
  ttl: minutes(1),
  limit: Number.POSITIVE_INFINITY,
  setHeaders: false,
  skipIf,
};

export const THROTTLERS: ThrottlerOptions[] = [
  { ttl: minutes(1), limit: 100, skipIf },
  { name: ANONYMOUS_THROTTLER, ...perRouteOnly },
  { name: HOURLY_THROTTLER, ...perRouteOnly },
];

export const throttleTracker = (
  auth: AuthService<Auth>,
): ThrottlerGetTrackerFunction => {
  const userIds = new WeakMap<object, Promise<string | undefined>>();
  return async (req) => {
    let userId = userIds.get(req);
    if (!userId) {
      userId = auth.api
        .getSession({ headers: fromNodeHeaders(req.headers) })
        .then(
          (session) => session?.user.id,
          () => undefined,
        );
      userIds.set(req, userId);
    }
    const id = await userId;
    if (id) return `user:${id}`;
    const ip = clientIp(req as Request);
    return ip ? `ip:${normalizeIp(ip)}` : 'ip:missing';
  };
};
