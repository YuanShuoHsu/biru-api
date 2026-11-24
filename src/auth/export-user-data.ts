// https://www.better-auth.com/docs/concepts/plugins

import { BASE_ERROR_CODES, type BetterAuthPlugin } from 'better-auth';
import {
  APIError,
  createAuthEndpoint,
  sensitiveSessionMiddleware,
} from 'better-auth/api';
import { and, eq, inArray } from 'drizzle-orm';
import * as z from 'zod';

import * as schema from '../db/schema/index.js';

import { authDb } from './auth-transaction.js';

const EXPORT_USER_DATA_PATH = '/export-user-data';

export const userData = async (userId: string) => {
  const db = authDb();
  const [profile, accounts, sessions] = await Promise.all([
    db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: {
        role: false,
        banned: false,
        banReason: false,
        banExpires: false,
      },
    }),
    db.query.account.findMany({
      where: eq(schema.account.userId, userId),
      columns: { providerId: true, createdAt: true },
    }),
    db.query.session.findMany({
      where: eq(schema.session.userId, userId),
      columns: {
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        userAgent: true,
        ipAddress: true,
      },
    }),
  ]);

  const [
    orders,
    pointTransactions,
    coupons,
    waitlistTickets,
    pushSubscriptions,
    sharedCarts,
    employees,
  ] = await Promise.all([
    db.query.order.findMany({
      where: eq(schema.order.userId, userId),
      columns: {
        idempotencyKey: false,
        idempotencyFingerprint: false,
        heldOfferStock: false,
      },
      with: {
        items: true,
        invoices: {
          columns: {
            type: true,
            carrierType: true,
            carrierNum: true,
            email: true,
            customerIdentifier: true,
            customerName: true,
            customerAddr: true,
            donateCode: true,
            status: true,
            invoiceNumber: true,
            invoiceDate: true,
            randomNumber: true,
            voidedAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: schema.order.createdAt,
    }),
    db.query.pointTransaction.findMany({
      where: eq(schema.pointTransaction.userId, userId),
      columns: { adjustedBy: false },
      orderBy: schema.pointTransaction.createdAt,
    }),
    db.query.userCoupon.findMany({
      where: eq(schema.userCoupon.userId, userId),
      columns: { grantedBy: false },
      with: {
        coupon: {
          columns: {
            code: true,
            discountType: true,
            discountValue: true,
            discountCurrency: true,
            validFrom: true,
            validThrough: true,
          },
        },
      },
      orderBy: schema.userCoupon.createdAt,
    }),
    db.query.waitlistTicket.findMany({
      where: eq(schema.waitlistTicket.userId, userId),
      columns: { idempotencyKey: false, idempotencyFingerprint: false },
      orderBy: schema.waitlistTicket.createdAt,
    }),
    db.query.pushSubscription.findMany({
      where: eq(schema.pushSubscription.userId, userId),
      columns: { endpoint: false, p256dh: false, auth: false },
    }),
    db.query.sharedCartParticipant.findMany({
      where: eq(schema.sharedCartParticipant.userId, userId),
      columns: { deviceKey: false, sessionId: false },
    }),
    db.query.attendanceEmployee.findMany({
      where: eq(schema.attendanceEmployee.userId, userId),
    }),
  ]);

  const employeeIds = employees.map(({ id }) => id);
  const [shifts, events, requests, leaveCases, payslips] = employeeIds.length
    ? await Promise.all([
        db.query.attendanceShift.findMany({
          where: inArray(schema.attendanceShift.employeeId, employeeIds),
          columns: { missingClockOutRemindedAt: false },
          orderBy: schema.attendanceShift.startsAt,
        }),
        db.query.attendanceEvent.findMany({
          where: inArray(schema.attendanceEvent.employeeId, employeeIds),
          columns: { idempotencyKey: false },
          orderBy: schema.attendanceEvent.occurredAt,
        }),
        db.query.attendanceRequest.findMany({
          where: inArray(schema.attendanceRequest.employeeId, employeeIds),
          columns: { reviewedBy: false },
          orderBy: schema.attendanceRequest.startsAt,
        }),
        db.query.attendanceLeaveCase.findMany({
          where: inArray(schema.attendanceLeaveCase.employeeId, employeeIds),
          columns: { createdBy: false },
          orderBy: schema.attendanceLeaveCase.startsAt,
        }),
        db.query.payrollStatement.findMany({
          where: and(
            inArray(schema.payrollStatement.employeeId, employeeIds),
            eq(schema.payrollStatement.status, 'published'),
          ),
          columns: {
            id: true,
            organizationId: true,
            employeeId: true,
            employeeName: true,
            month: true,
            snapshot: true,
            publishedAt: true,
            paidOn: true,
          },
          orderBy: schema.payrollStatement.month,
        }),
      ])
    : [[], [], [], [], []];

  return {
    exportedAt: new Date(),
    profile,
    accounts,
    sessions,
    orders,
    pointTransactions,
    coupons,
    waitlistTickets,
    pushSubscriptions,
    sharedCarts,
    employment: { employees, shifts, events, requests, leaveCases, payslips },
  };
};

export const exportUserData = () =>
  ({
    id: 'export-user-data',
    endpoints: {
      exportUserData: createAuthEndpoint(
        EXPORT_USER_DATA_PATH,
        {
          method: 'POST',
          use: [sensitiveSessionMiddleware],
          body: z.object({ password: z.string().optional() }),
        },
        async (ctx) => {
          const { session } = ctx.context;
          const account =
            await ctx.context.internalAdapter.findCredentialAccount(
              session.user.id,
            );

          if (account?.password) {
            const { password } = ctx.body;
            if (
              password &&
              password.length > ctx.context.password.config.maxPasswordLength
            )
              throw APIError.from(
                'BAD_REQUEST',
                BASE_ERROR_CODES.PASSWORD_TOO_LONG,
              );
            if (
              !password ||
              !(await ctx.context.password.verify({
                hash: account.password,
                password,
              }))
            )
              throw APIError.from(
                'BAD_REQUEST',
                BASE_ERROR_CODES.INVALID_PASSWORD,
              );
          } else if (
            ctx.context.sessionConfig.freshAge !== 0 &&
            Date.now() - new Date(session.session.createdAt).getTime() >=
              ctx.context.sessionConfig.freshAge * 1000
          )
            throw APIError.from(
              'BAD_REQUEST',
              BASE_ERROR_CODES.SESSION_EXPIRED,
            );

          return ctx.json(await userData(session.user.id));
        },
      ),
    },
    rateLimit: [
      {
        pathMatcher: (path) => path === EXPORT_USER_DATA_PATH,
        window: 60,
        max: 3,
      },
    ],
  }) satisfies BetterAuthPlugin;
