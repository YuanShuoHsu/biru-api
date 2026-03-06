// npx @better-auth/cli generate --config src/auth/generate/auth-generate.ts --output src/auth/generate/auth-schema.ts

import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { betterAuth } from 'better-auth/minimal';
import { organization } from 'better-auth/plugins';
import { db } from 'src/db';
import * as schema from 'src/db/schema';

export const auth = betterAuth({
  account: {
    accountLinking: {
      enabled: true,
    },
  },
  advanced: {
    crossSubDomainCookies: {
      enabled: process.env.NODE_ENV === 'production',
      domain: '.birucoffee.com',
    },
  },
  appName: 'biru-api',
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  emailVerification: {
    autoSignInAfterVerification: true,
  },
  plugins: [organization()],
  rateLimit: {
    enabled: true,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  trustedOrigins: [process.env.NEXT_URL!],
  user: {
    additionalFields: {
      // birthDate: {
      //   type: 'date',
      //   required: true,
      // },
      emailSubscribed: {
        type: 'boolean',
        required: true,
        defaultValue: true,
      },
      firstName: {
        type: 'string',
        required: true,
      },
      // gender: {
      //   type: schema.gendersEnum.enumValues,
      //   required: true,
      //   defaultValue: schema.DEFAULT_GENDER,
      // },
      lang: {
        type: schema.langsEnum.enumValues,
        required: true,
        defaultValue: schema.DEFAULT_LANG,
      },
      lastName: {
        type: 'string',
        required: false,
      },
      // phoneNumber: {
      //   type: 'string',
      //   required: true,
      // },
      // phoneNumberVerified: {
      //   type: 'boolean',
      //   required: true,
      //   defaultValue: false,
      //   input: false,
      // },
    },
  },
});
