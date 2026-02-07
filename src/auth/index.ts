// https://www.better-auth.com/docs/authentication/email-password
// https://www.better-auth.com/docs/concepts/email
// https://www.better-auth.com/docs/concepts/rate-limit
// https://www.better-auth.com/docs/concepts/users-accounts

import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { betterAuth } from 'better-auth/minimal';

import { db } from '../db';
import * as schema from '../db/schema';

export const auth = betterAuth({
  account: {
    accountLinking: {
      enabled: true,
    },
  },
  appName: 'biru-api',
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async () => {
      // TODO: Implement sendEmail integration
      /*
      void sendEmail({
        to: user.email,
        subject: 'Reset your password',
        text: `Click the link to reset your password: ${url}`,
      });
      */
    },
    requireEmailVerification: true,
  },
  emailVerification: {
    autoSignInAfterVerification: true,
    sendVerificationEmail: async () => {
      // TODO: Implement sendEmail integration
      /*
      void sendEmail({
        to: user.email,
        subject: 'Verify your email address',
        text: `Click the link to verify your email: ${url}`,
      });
      */
    },
    sendOnSignIn: true,
  },
  plugins: [],
  rateLimit: {
    enabled: true,
  },
  socialProviders: {},
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
      role: {
        type: schema.rolesEnum.enumValues,
        required: true,
        defaultValue: schema.DEFAULT_ROLE,
        input: false,
      },
    },
  },
});
