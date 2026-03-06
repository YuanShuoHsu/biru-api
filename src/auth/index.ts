// https://www.better-auth.com/docs/authentication/email-password
// https://www.better-auth.com/docs/concepts/email
// https://www.better-auth.com/docs/concepts/rate-limit
// https://www.better-auth.com/docs/concepts/users-accounts

import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { betterAuth } from 'better-auth/minimal';
import { organization } from 'better-auth/plugins';

import { ac, admin, member, owner } from './permissions';

import { db } from '../db';
import * as schema from '../db/schema';
import type { MailsService } from '../mails/mails.service';

export const createAuth = (mailsService: MailsService) =>
  betterAuth({
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
      // 1.5.x 的版本有點問題，先不要升級也不要用它 onExistingUserSignUp
      // onExistingUserSignUp: async ({ user }, request) => {
      //   await mailsService.onExistingUserSignUp({ user }, request);
      // },
      onPasswordReset: async ({ user }, request) => {
        await mailsService.onPasswordReset({ user }, request);
      },
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url, token }, request) => {
        await mailsService.sendResetPassword({ user, url, token }, request);
      },
    },
    emailVerification: {
      afterEmailVerification: async (user, request) => {
        await mailsService.afterEmailVerification(
          {
            user,
          },
          request,
        );
      },
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url, token }, request) => {
        await mailsService.sendVerificationEmail({ user, url, token }, request);
      },
    },
    plugins: [
      organization({
        ac,
        cancelPendingInvitationsOnReInvite: true,
        dynamicAccessControl: {
          enabled: true,
        },
        requireEmailVerificationOnInvitation: true,
        roles: { owner, admin, member },
        async sendInvitationEmail(data) {
          await mailsService.sendOrganizationInvitation(data);
        },
      }),
    ],
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
    advanced: {
      crossSubDomainCookies: {
        enabled: true,
        domain: '.birucoffee.com',
      },
    },
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

export type Auth = ReturnType<typeof createAuth>;
