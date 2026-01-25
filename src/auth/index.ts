import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { betterAuth } from 'better-auth/minimal';

import * as schema from '../db/schema';

import { db } from './database';

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
