import { hours, minutes, type ThrottlerOptions } from '@nestjs/throttler';

export const HOURLY_THROTTLER = 'hourly';

// forRoot 的每個 throttler 都套用到所有路由，且 skipIf 會連 @Throttle 覆寫一起略過，所以每小時上限預設無限，只在需要的路由用 @Throttle 覆寫
export const THROTTLERS: ThrottlerOptions[] = [
  { ttl: minutes(1), limit: 100 },
  {
    name: HOURLY_THROTTLER,
    ttl: hours(1),
    limit: Number.POSITIVE_INFINITY,
    setHeaders: false,
  },
];
