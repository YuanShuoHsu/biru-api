import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { betterAuth } from 'better-auth/minimal';

import { db } from '../db';
import * as schema from '../db/schema';

export const auth = betterAuth({
  appName: 'biru-api',
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [],
  socialProviders: {},
});
