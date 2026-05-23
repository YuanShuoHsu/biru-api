// https://www.better-auth.com/docs/authentication/email-password
// https://better-auth.com/docs/authentication/google
// https://www.better-auth.com/docs/concepts/email
// https://www.better-auth.com/docs/concepts/rate-limit
// https://www.better-auth.com/docs/concepts/users-accounts
// https://better-auth.com/docs/concepts/oauth
// https://better-auth.com/docs/plugins/admin
// https://better-auth.com/docs/plugins/organization

import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { betterAuth } from 'better-auth/minimal';
import {
  admin as adminPlugin,
  multiSession,
  organization,
} from 'better-auth/plugins';
import { eq } from 'drizzle-orm';

import { ac, admin, member, owner } from './permissions';

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
        allowUnlinkingAll: false,
        trustedProviders: ['google'],
        updateUserInfoOnLink: true,
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
      customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
        ...coreFields,
        role: 'user',
        banned: false,
        banReason: null,
        banExpires: null,
        ...additionalFields,
        id,
      }),
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
      multiSession(),
      organization({
        ac,
        roles: { owner, admin, member },
        cancelPendingInvitationsOnReInvite: true,
        requireEmailVerificationOnInvitation: true,
        schema: {
          organization: {
            additionalFields: {
              // https://schema.org/PostalAddress
              addressCountry: {
                type: 'string',
                required: false,
                defaultValue: 'TW',
              },
              addressLocality: {
                type: 'string',
                required: false,
              },
              addressRegion: {
                type: 'string',
                required: false,
              },
              extendedAddress: {
                type: 'string',
                required: false,
              },
              postalCode: {
                type: 'string',
                required: false,
              },
              streetAddress: {
                type: 'string',
                required: false,
              },

              isOpen: {
                type: 'boolean',
                required: false,
                defaultValue: true,
              },
            },
          },
        },
        async sendInvitationEmail(
          { id, email, role, organization, inviter },
          request,
        ) {
          await mailsService.sendInvitationEmail(
            { id, email, role, organization, inviter },
            request,
          );
        },
        teams: {
          enabled: true,
          allowRemovingAllTeams: true,
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
        prompt: 'select_account',
      },
    },
    trustedOrigins: [process.env.NEXT_URL!, process.env.NEXT_ADMIN_URL!],
    user: {
      additionalFields: {
        bio: {
          type: 'string',
          required: false,
        },
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
        // 未來物流可能需要 https://better-auth.com/docs/plugins/phone-number
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
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async (
          { user, newEmail, url, token },
          request,
        ) => {
          await mailsService.sendChangeEmailConfirmation(
            { user, newEmail, url, token },
            request,
          );
        },
      },
      deleteUser: {
        enabled: true,
        sendDeleteAccountVerification: async (
          {
            user,
            url,
            token,
          }: {
            user: { email: string; name: string };
            url: string;
            token: string;
          },
          request?: Request,
        ) => {
          await mailsService.sendDeleteAccountVerification(
            { user, url, token },
            request,
          );
        },
      },
    },
  });

export type Auth = ReturnType<typeof createAuth>;
