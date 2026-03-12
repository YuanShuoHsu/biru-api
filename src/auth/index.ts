// https://www.better-auth.com/docs/authentication/email-password
// https://www.better-auth.com/docs/concepts/email
// https://www.better-auth.com/docs/concepts/rate-limit
// https://www.better-auth.com/docs/concepts/users-accounts
// https://better-auth.com/docs/concepts/oauth
// https://better-auth.com/docs/plugins/admin
// https://better-auth.com/docs/plugins/organization

import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { betterAuth } from 'better-auth/minimal';
import { admin as adminPlugin, organization } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';

import { db } from '../db';
import * as schema from '../db/schema';
import type { MailsService } from '../mails/mails.service';

const getInitialOrganization = async (userId: string) => {
  const membership = await db.query.member.findFirst({
    where: eq(schema.member.userId, userId),
    with: { organization: true },
  });

  return membership?.organization;
};

export const createAuth = (mailsService: MailsService) =>
  betterAuth({
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
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const organization = await getInitialOrganization(session.userId);

            return {
              data: {
                ...session,
                activeOrganizationId: organization?.id,
              },
            };
          },
        },
      },
    },
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema,
    }),
    emailAndPassword: {
      // 尚有型別問題，未來升級再添加
      // customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
      //   ...coreFields,
      //   // Admin plugin fields (in schema order)
      //   role: 'user', // or your configured defaultRole
      //   banned: false,
      //   banReason: null,
      //   banExpires: null,
      //   ...additionalFields,
      //   id,
      // }),
      enabled: true,
      onExistingUserSignUp: async ({ user }, request) => {
        await mailsService.onExistingUserSignUp({ user }, request);
      },
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
      adminPlugin(),
      organization({
        cancelPendingInvitationsOnReInvite: true,
        requireEmailVerificationOnInvitation: true,
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
        mapProfileToUser: (profile) => {
          return {
            firstName: profile.given_name,
            lastName: profile.family_name,
          };
        },
      },
    },
    trustedOrigins: [process.env.NEXT_URL!, process.env.NEXT_ADMIN_URL!],
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
