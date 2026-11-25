// https://www.better-auth.com/docs/concepts/plugins

import { BASE_ERROR_CODES, type BetterAuthPlugin } from 'better-auth';
import {
  APIError,
  createAuthEndpoint,
  sensitiveSessionMiddleware,
} from 'better-auth/api';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import * as z from 'zod';

import { decryptField } from '../common/utils/field-encryption.js';
import * as schema from '../db/schema/index.js';
import { maskTaxId } from '../payroll/tax-ids.js';

import { authDb } from './auth-transaction.js';

const EXPORT_USER_DATA_PATH = '/export-user-data';

const USER_COLUMNS = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  image: true,
  bio: true,
  birthDate: true,
  emailSubscribed: true,
  firstName: true,
  lastName: true,
  lang: true,
  phoneNumber: true,
  phoneNumberVerified: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ORDER_COLUMNS = {
  id: true,
  sellerId: true,
  mode: true,
  orderNumber: true,
  confirmationNumber: true,
  orderStatus: true,
  customer: true,
  orderDate: true,
  paymentMethod: true,
  paymentMethodId: true,
  paymentDate: true,
  paymentDueDate: true,
  merchantTradeNo: true,
  tradeNo: true,
  partySize: true,
  pickupTime: true,
  readyAt: true,
  tableNumber: true,
  sharedCartId: true,
  discount: true,
  discountCode: true,
  discountCurrency: true,
  subtotal: true,
  total: true,
  amountPerPoint: true,
  createdAt: true,
  updatedAt: true,
} as const;

const ORDER_ITEM_COLUMNS = {
  id: true,
  menuItemName: true,
  orderQuantity: true,
  unitPrice: true,
  priceCurrency: true,
  discount: true,
  addOns: true,
  modifiers: true,
  servingTemperatureLevel: true,
  sweetnessLevel: true,
  participantNickname: true,
  participantAvatar: true,
  createdAt: true,
} as const;

const INVOICE_COLUMNS = {
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
} as const;

const POINT_TRANSACTION_COLUMNS = {
  id: true,
  organizationId: true,
  orderId: true,
  userCouponId: true,
  type: true,
  points: true,
  remainingPoints: true,
  expiresAt: true,
  note: true,
  createdAt: true,
} as const;

const USER_COUPON_COLUMNS = {
  id: true,
  source: true,
  orderId: true,
  usedAt: true,
  createdAt: true,
} as const;

const COUPON_COLUMNS = {
  code: true,
  discountType: true,
  discountValue: true,
  discountCurrency: true,
  validFrom: true,
  validThrough: true,
} as const;

const WAITLIST_TICKET_COLUMNS = {
  id: true,
  organizationId: true,
  serviceDate: true,
  prefix: true,
  number: true,
  partySize: true,
  name: true,
  phoneNumber: true,
  email: true,
  locale: true,
  status: true,
  cancelReason: true,
  calledAt: true,
  confirmedAt: true,
  endedAt: true,
  createdAt: true,
} as const;

const PUSH_SUBSCRIPTION_COLUMNS = {
  id: true,
  app: true,
  lang: true,
  orderId: true,
  waitlistTicketId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const SHARED_CART_PARTICIPANT_COLUMNS = {
  id: true,
  sharedCartId: true,
  nickname: true,
  avatar: true,
  memberProfile: true,
  status: true,
  requestedAt: true,
  joinedAt: true,
} as const;

const PAYSLIP_COLUMNS = {
  id: true,
  organizationId: true,
  employeeId: true,
  employeeName: true,
  month: true,
  snapshot: true,
  publishedAt: true,
  paidOn: true,
} as const;

const userData = async (userId: string) => {
  const db = authDb();
  const [profile, accounts, sessions] = await Promise.all([
    db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: USER_COLUMNS,
    }),
    db.query.account.findMany({
      where: eq(schema.account.userId, userId),
      columns: { providerId: true, createdAt: true },
    }),
    db.query.session.findMany({
      where: and(
        eq(schema.session.userId, userId),
        isNull(schema.session.impersonatedBy),
      ),
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
      columns: ORDER_COLUMNS,
      with: {
        items: { columns: ORDER_ITEM_COLUMNS },
        invoices: { columns: INVOICE_COLUMNS },
      },
      orderBy: schema.order.createdAt,
    }),
    db.query.pointTransaction.findMany({
      where: eq(schema.pointTransaction.userId, userId),
      columns: POINT_TRANSACTION_COLUMNS,
      orderBy: schema.pointTransaction.createdAt,
    }),
    db.query.userCoupon.findMany({
      where: eq(schema.userCoupon.userId, userId),
      columns: USER_COUPON_COLUMNS,
      with: { coupon: { columns: COUPON_COLUMNS } },
      orderBy: schema.userCoupon.createdAt,
    }),
    db.query.waitlistTicket.findMany({
      where: eq(schema.waitlistTicket.userId, userId),
      columns: WAITLIST_TICKET_COLUMNS,
      orderBy: schema.waitlistTicket.createdAt,
    }),
    db.query.pushSubscription.findMany({
      where: eq(schema.pushSubscription.userId, userId),
      columns: PUSH_SUBSCRIPTION_COLUMNS,
    }),
    db.query.sharedCartParticipant.findMany({
      where: eq(schema.sharedCartParticipant.userId, userId),
      columns: SHARED_CART_PARTICIPANT_COLUMNS,
    }),
    db.query.attendanceEmployee.findMany({
      where: eq(schema.attendanceEmployee.userId, userId),
    }),
  ]);

  const employeeIds = employees.map(({ id }) => id);
  const [shifts, events, requests, leaveCases, payslips, taxIdentities] =
    employeeIds.length
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
            columns: PAYSLIP_COLUMNS,
            orderBy: schema.payrollStatement.month,
          }),
          db.query.payrollTaxIdentity.findMany({
            where: inArray(schema.payrollTaxIdentity.employeeId, employeeIds),
          }),
        ])
      : [[], [], [], [], [], []];

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
    employment: {
      employees,
      shifts,
      events,
      requests,
      leaveCases,
      payslips,
      taxIdentities: taxIdentities.map((identity) => ({
        employeeId: identity.employeeId,
        taxIdMasked: maskTaxId(decryptField(identity.encryptedTaxId)),
        address: decryptField(identity.encryptedAddress),
        residenceCountryCode: identity.residenceCountryCode,
        foreignTaxIdMasked:
          identity.encryptedForeignTaxId &&
          maskTaxId(decryptField(identity.encryptedForeignTaxId)),
        updatedAt: identity.updatedAt,
      })),
    },
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
          if (session.session.impersonatedBy)
            throw new APIError('FORBIDDEN', {
              message: 'User data cannot be exported while impersonating',
              code: 'IMPERSONATED_SESSION_CANNOT_EXPORT_USER_DATA',
            });
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
