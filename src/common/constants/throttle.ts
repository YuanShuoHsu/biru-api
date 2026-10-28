import { minutes, type ThrottlerOptions } from '@nestjs/throttler';

import { trustedProxies } from '../trusted-proxy.js';

export const ANONYMOUS_THROTTLER = 'anonymous';
export const HOURLY_THROTTLER = 'hourly';

const perRouteOnly: Omit<ThrottlerOptions, 'name'> = {
  ttl: minutes(1),
  limit: Number.POSITIVE_INFINITY,
  setHeaders: false,
  skipIf: () => !trustedProxies(),
};

export const THROTTLERS: ThrottlerOptions[] = [
  { ttl: minutes(1), limit: 100 },
  { name: ANONYMOUS_THROTTLER, ...perRouteOnly },
  { name: HOURLY_THROTTLER, ...perRouteOnly },
];
