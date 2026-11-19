import { eq, isNull, lt, or } from 'drizzle-orm';

import { user } from '../../db/schema/users.js';

// https://better-auth.com/docs/plugins/admin#ban-user
export const notBanned = (now: Date) =>
  or(isNull(user.banned), eq(user.banned, false), lt(user.banExpires, now));
