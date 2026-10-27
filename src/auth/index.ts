// https://www.better-auth.com/docs/authentication/email-password
// https://better-auth.com/docs/authentication/google
// https://www.better-auth.com/docs/concepts/email
// https://www.better-auth.com/docs/concepts/rate-limit
// https://www.better-auth.com/docs/concepts/users-accounts
// https://better-auth.com/docs/concepts/oauth
// https://better-auth.com/docs/plugins/admin
// https://better-auth.com/docs/plugins/organization

import { Logger } from '@nestjs/common';

import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { betterAuth } from 'better-auth/minimal';
import {
  admin as adminPlugin,
  multiSession,
  organization,
} from 'better-auth/plugins';
import { asc, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import { authDb, runInAuthSavepoint } from './auth-transaction.js';
import { assertOrganizationDeletable } from './deletion-guards.js';
import { cancelExpiredInvitations } from './expired-invitations.js';
import { authHookState, createAuthHooks } from './hooks.js';
import type { createAuthI18n } from './i18n.js';
import { ac, admin, member, owner } from './permissions.js';

import type { Transaction } from '../attendance/attendance-audit.js';
import { statutoryLeaveTypeSeeds } from '../attendance/statutory-leave-types.js';

import { DINE_IN_MAX_TABLE_COUNT } from '../common/constants/dine-in.js';
import {
  PICKUP_MAX_ADVANCE_DAYS,
  PICKUP_MAX_MINUTES,
} from '../common/constants/pickup.js';
import { diffAuditRows } from '../common/utils/audit-diff.js';
import { isValidCurrency } from '../common/utils/currency.js';
import { isValidOpeningHours } from '../common/utils/opening-hours.js';
import { db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import type { CouponsService } from '../coupons/coupons.service.js';
import type { MailsService } from '../mails/mails.service.js';

const logger = new Logger('OrganizationAudit');
const signupCouponLogger = new Logger('SignupCoupons');

const getInitialOrganization = async (userId: string) => {
  const membership = await authDb().query.member.findFirst({
    where: eq(schema.member.userId, userId),
    orderBy: [asc(schema.member.createdAt), asc(schema.member.id)],
    with: { organization: true },
  });

  return membership?.organization;
};

const PICKUP_FIELD_MAXIMUMS = {
  pickupLeadMinutes: PICKUP_MAX_MINUTES,
  pickupMaxAdvanceDays: PICKUP_MAX_ADVANCE_DAYS,
  pickupCutoffMinutes: PICKUP_MAX_MINUTES,
};

const assertValidOrganizationInput = (data: Record<string, unknown>) => {
  if (
    typeof data.openingHours === 'string' &&
    !isValidOpeningHours(data.openingHours)
  )
    throw new APIError('BAD_REQUEST', {
      message: 'openingHours must match "Mo-Fr 09:00-12:00,13:00-18:00"',
    });

  if (Object.hasOwn(data, 'currency') && !isValidCurrency(data.currency))
    throw new APIError('BAD_REQUEST', {
      message: 'currency must be an uppercase ISO 4217 code',
    });

  for (const [field, max] of Object.entries(PICKUP_FIELD_MAXIMUMS)) {
    const value = data[field];
    if (value === undefined) continue;

    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > max
    )
      throw new APIError('BAD_REQUEST', {
        message: `${field} must be an integer from 0 to ${max}`,
      });
  }

  const { dineInTableCount } = data;
  if (
    dineInTableCount != null &&
    (typeof dineInTableCount !== 'number' ||
      !Number.isInteger(dineInTableCount) ||
      dineInTableCount < 1 ||
      dineInTableCount > DINE_IN_MAX_TABLE_COUNT)
  )
    throw new APIError('BAD_REQUEST', {
      message: `dineInTableCount must be an integer from 1 to ${DINE_IN_MAX_TABLE_COUNT}`,
    });
};

const assertSlugAvailable = async (slug: unknown, organizationId?: string) => {
  if (typeof slug !== 'string') return;

  const previous = await authDb().query.organizationSlugHistory.findFirst({
    where: eq(schema.organizationSlugHistory.slug, slug),
    columns: { organizationId: true },
  });
  if (previous && previous.organizationId !== organizationId)
    throw new APIError('BAD_REQUEST', {
      message: 'Organization slug already taken',
      code: 'ORGANIZATION_SLUG_ALREADY_TAKEN',
    });
};

export const authDatabase = (database: typeof db | Transaction) =>
  drizzleAdapter(database, { provider: 'pg', schema });

const issueSignupCoupons = async (
  couponsService: CouponsService,
  userId: string,
) => {
  try {
    await couponsService.issueSignupCoupons(userId);
  } catch (error) {
    signupCouponLogger.error(error);
  }
};

export const createAuth = (
  mailsService: MailsService,
  couponsService: CouponsService,
  authI18n: ReturnType<typeof createAuthI18n>,
) =>
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
        create: {
          after: async (user) => {
            if (user.emailVerified)
              await issueSignupCoupons(couponsService, user.id);
          },
        },
        update: {
          before: async (user, context) => {
            if (!('phoneNumber' in user)) return;

            const phoneNumber =
              typeof user.phoneNumber === 'string' && user.phoneNumber
                ? user.phoneNumber
                : null;
            if (phoneNumber) {
              const owner = await authDb().query.user.findFirst({
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
    database: authDatabase(db),
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
        await issueSignupCoupons(couponsService, user.id);
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
    hooks: createAuthHooks(authI18n.localizeError),
    plugins: [
      adminPlugin(),
      multiSession(),
      organization({
        ac,
        allowUserToCreateOrganization: (user) => user.role === 'admin',
        cancelPendingInvitationsOnReInvite: true,
        organizationHooks: {
          afterCreateOrganization: async ({ organization }) => {
            try {
              await authDb().transaction(async (tx) => {
                await tx
                  .insert(schema.menu)
                  .values({
                    id: uuidv4(),
                    organizationId: organization.id,
                    name: { 'zh-TW': organization.name },
                  })
                  .onConflictDoNothing();
                await tx
                  .insert(schema.attendanceLeaveType)
                  .values(statutoryLeaveTypeSeeds(organization.id))
                  .onConflictDoNothing();
              });
            } catch (error) {
              await authDb()
                .delete(schema.organization)
                .where(eq(schema.organization.id, organization.id));

              throw new APIError('INTERNAL_SERVER_ERROR', {
                message: 'Failed to seed the organization defaults',
                cause: error,
              });
            }
          },
          beforeCreateInvitation: async ({ invitation, organization }) => {
            await cancelExpiredInvitations(organization.id, invitation.email);
          },
          beforeDeleteOrganization: ({ organization: target }) =>
            assertOrganizationDeletable(target.id),
          beforeCreateOrganization: async ({ organization: data }) => {
            assertValidOrganizationInput(data);
            await assertSlugAvailable(data.slug);
          },
          beforeUpdateOrganization: async ({ organization: data, member }) => {
            assertValidOrganizationInput(data);

            const current = await authDb().query.organization.findFirst({
              where: eq(schema.organization.id, member.organizationId),
            });

            authHookState().snapshot = current;

            if (
              current &&
              data.slug !== undefined &&
              data.slug !== current.slug
            ) {
              await assertSlugAvailable(data.slug, current.id);
              await authDb()
                .insert(schema.organizationSlugHistory)
                .values({
                  id: uuidv4(),
                  slug: current.slug,
                  organizationId: current.id,
                })
                .onConflictDoNothing();
            }

            const touchesPoints =
              Object.hasOwn(data, 'amountPerPoint') ||
              Object.hasOwn(data, 'pointsEnabledAt');
            if (!touchesPoints) return;

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
          afterUpdateOrganization: async ({
            organization: updated,
            user,
            member,
          }) => {
            const before = authHookState().snapshot;
            if (!updated) return;

            const after = await authDb().query.organization.findFirst({
              where: eq(schema.organization.id, member.organizationId),
            });
            if (!after) return;

            const changes = diffAuditRows(before, after);
            if (!Object.keys(changes).length) return;

            try {
              await runInAuthSavepoint(() =>
                authDb().insert(schema.auditLog).values({
                  id: uuidv4(),
                  actorId: user.id,
                  actorName: user.name,
                  actorEmail: user.email,
                  organizationId: member.organizationId,
                  resource: 'organization',
                  resourceId: member.organizationId,
                  resourceLabel: after.name,
                  ancestorIds: [],
                  action: 'update',
                  changes,
                }),
              );
            } catch (error) {
              logger.error('Failed to write audit log', error);
            }
          },
        },
        requireEmailVerificationOnInvitation: true,
        roles: { owner, admin, member },
        schema: {
          member: {
            additionalFields: {
              showcase: {
                type: 'boolean',
                required: false,
                defaultValue: false,
                input: false,
              },
            },
          },
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

              currency: {
                type: 'string',
                required: false,
              },

              amountPerPoint: {
                type: 'number',
                required: false,
              },
              pointsEnabledAt: {
                type: 'date',
                required: false,
              },
              // 停業／復業只走平台管理員端點，店家不能經由 organization.update 自行改
              closedAt: {
                type: 'date',
                required: false,
                input: false,
              },
              pointsValidityYears: {
                type: 'number',
                required: false,
              },

              pickupLeadMinutes: {
                type: 'number',
                required: false,
              },
              pickupMaxAdvanceDays: {
                type: 'number',
                required: false,
              },
              pickupCutoffMinutes: {
                type: 'number',
                required: false,
              },
              dineInTableCount: {
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
      authI18n.plugin,
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
