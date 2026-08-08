// https://www.better-auth.com/docs/authentication/email-password
// https://better-auth.com/docs/authentication/google
// https://www.better-auth.com/docs/concepts/email
// https://www.better-auth.com/docs/concepts/rate-limit
// https://www.better-auth.com/docs/concepts/users-accounts
// https://better-auth.com/docs/concepts/oauth
// https://better-auth.com/docs/plugins/admin
// https://better-auth.com/docs/plugins/organization

import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { betterAuth } from 'better-auth/minimal';
import {
  admin as adminPlugin,
  multiSession,
  organization,
} from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

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
      user: {
        update: {
          before: async (user, context) => {
            if (!('phoneNumber' in user)) return;

            const phoneNumber =
              typeof user.phoneNumber === 'string' && user.phoneNumber
                ? user.phoneNumber
                : null;
            if (phoneNumber) {
              const owner = await db.query.user.findFirst({
                where: eq(schema.user.phoneNumber, phoneNumber),
              });

              if (owner && owner.id !== context?.context.session?.user.id)
                throw new APIError('BAD_REQUEST', {
                  code: 'PHONE_NUMBER_ALREADY_EXISTS',
                  message: 'Phone number already exists',
                });
            }

            return {
              data: {
                ...user,
                phoneNumber,
                ...(!('phoneNumberVerified' in user) && {
                  phoneNumberVerified: false,
                }),
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
        cancelPendingInvitationsOnReInvite: true,
        organizationHooks: {
          afterCreateOrganization: async ({ organization }) => {
            await db
              .insert(schema.menu)
              .values({
                id: uuidv4(),
                organizationId: organization.id,
                name: { 'zh-TW': organization.name },
              })
              .onConflictDoNothing();
          },
          // pointsEnabledAt 由 server 推導，不信任 client 傳入值
          beforeUpdateOrganization: async ({ organization: data, member }) => {
            const touchesPoints =
              Object.hasOwn(data, 'amountPerPoint') ||
              Object.hasOwn(data, 'pointsEnabledAt');
            if (!touchesPoints) return;

            const current = await db.query.organization.findFirst({
              columns: { amountPerPoint: true, pointsEnabledAt: true },
              where: eq(schema.organization.id, member.organizationId),
            });

            const enabled = Object.hasOwn(data, 'amountPerPoint')
              ? data.amountPerPoint != null
              : current?.amountPerPoint != null;
            if (!enabled)
              return {
                data: { pointsEnabledAt: null, pointsValidityYears: null },
              };

            return {
              data: { pointsEnabledAt: current?.pointsEnabledAt ?? new Date() },
            };
          },
        },
        requireEmailVerificationOnInvitation: true,
        roles: { owner, admin, member },
        schema: {
          organization: {
            additionalFields: {
              // https://schema.org/PostalAddress
              addressCountry: {
                type: 'string',
                required: false,
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

              // https://schema.org/LocalBusiness
              hasMap: {
                type: 'string',
                required: false,
              },
              openingHours: {
                type: 'string',
                required: false,
              },
              telephone: {
                type: 'string',
                required: false,
              },

              // 點數設定：每累積 1 點所需消費金額；null = 未啟用點數
              amountPerPoint: {
                type: 'number',
                required: false,
              },
              // 點數啟用時間；僅累計此時間之後付款的訂單
              pointsEnabledAt: {
                type: 'date',
                required: false,
              },
              // 點數效期（年）；null = 永久有效
              pointsValidityYears: {
                type: 'number',
                required: false,
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
        birthDate: {
          type: 'date',
          required: false,
        },
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
          type: schema.languagesEnum.enumValues,
          required: true,
          defaultValue: schema.DEFAULT_LANGUAGE,
        },
        lastName: {
          type: 'string',
          required: false,
        },
        // 未來物流需要 https://better-auth.com/docs/plugins/phone-number
        phoneNumber: {
          type: 'string',
          required: false,
        },
        // input: false 讓前端無法自行寫入；只有 phone-number plugin 的驗證流程能設為 true
        phoneNumberVerified: {
          type: 'boolean',
          required: true,
          defaultValue: false,
          input: false,
        },
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
