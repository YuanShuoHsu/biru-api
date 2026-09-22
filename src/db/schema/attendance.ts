import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { organization } from './organizations';
import { user } from './users';

export const ATTENDANCE_DAY_KINDS = [
  'workday',
  'restDay',
  'regularLeave',
  'holiday',
] as const;

export type AttendanceDayKind = (typeof ATTENDANCE_DAY_KINDS)[number];

export const ATTENDANCE_EVENT_ACTIONS = [
  'clockIn',
  'breakStart',
  'breakEnd',
  'clockOut',
] as const;

export type AttendanceEventAction = (typeof ATTENDANCE_EVENT_ACTIONS)[number];

export const STATUTORY_LEAVE_KINDS = [
  'custom',
  'annual',
  'personal',
  'familyCare',
  'sick',
  'hospitalSick',
  'pregnancyRest',
  'parental',
  'menstrual',
  'marriage',
  'funeral8',
  'funeral6',
  'funeral3',
  'prenatal',
  'paternity',
  'maternity',
  'miscarriage28',
  'miscarriage7',
  'miscarriage5',
] as const;

export type StatutoryLeaveKind = (typeof STATUTORY_LEAVE_KINDS)[number];

export const attendanceAction = pgEnum(
  'attendance_action',
  ATTENDANCE_EVENT_ACTIONS,
);
export const attendanceRequestKind = pgEnum('attendance_request_kind', [
  'correction',
  'leave',
  'overtime',
]);
export const attendanceRequestStatus = pgEnum('attendance_request_status', [
  'pending',
  'approved',
  'rejected',
  'withdrawn',
  'cancellationPending',
  'cancelled',
]);

export interface WeeklyMinutesChange {
  from: string;
  minutes: number;
}

export const attendanceEmployee = pgTable(
  'attendance_employee',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    userId: text('user_id').notNull(),
    name: text('name').notNull(),
    weeklyMinutes: integer('weekly_minutes').notNull().default(2400),
    weeklyMinutesHistory: jsonb('weekly_minutes_history')
      .$type<WeeklyMinutesChange[]>()
      .notNull()
      .default([]),
    enabled: boolean('enabled').notNull().default(true),
    hiredAt: timestamp('hired_at', { withTimezone: true }).notNull(),
    terminatedAt: timestamp('terminated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('attendance_employee_org_user_uidx').on(
      t.organizationId,
      t.userId,
    ),
  ],
);

export const attendanceSettings = pgTable(
  'attendance_settings',
  {
    organizationId: text('organization_id')
      .primaryKey()
      .references(() => organization.id, { onDelete: 'cascade' }),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    radiusMeters: integer('radius_meters').notNull(),
    allowedIps: text('allowed_ips').array().notNull(),
    graceMinutes: integer('grace_minutes').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [check('attendance_radius_positive', sql`${t.radiusMeters} > 0`)],
);

export const attendanceShift = pgTable(
  'attendance_shift',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => attendanceEmployee.id),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    paidBreak: boolean('paid_break').notNull().default(false),
    breakStartsAt: timestamp('break_starts_at', { withTimezone: true }),
    breakEndsAt: timestamp('break_ends_at', { withTimezone: true }),
    dayKind: text('day_kind')
      .$type<AttendanceDayKind>()
      .notNull()
      .default('workday'),
    status: text('status')
      .$type<'scheduled' | 'cancelled'>()
      .notNull()
      .default('scheduled'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('attendance_shift_org_start_idx').on(t.organizationId, t.startsAt),
    index('attendance_shift_employee_start_idx').on(t.employeeId, t.startsAt),
    check('attendance_shift_interval', sql`${t.endsAt} > ${t.startsAt}`),
    check(
      'attendance_shift_break',
      sql`(${t.breakStartsAt} IS NULL AND ${t.breakEndsAt} IS NULL) OR (${t.breakStartsAt} >= ${t.startsAt} AND ${t.breakEndsAt} > ${t.breakStartsAt} AND ${t.breakEndsAt} <= ${t.endsAt})`,
    ),
  ],
);

export const attendanceEvent = pgTable(
  'attendance_event',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => attendanceEmployee.id),
    shiftId: text('shift_id')
      .notNull()
      .references(() => attendanceShift.id),
    action: attendanceAction('action').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    accuracy: doublePrecision('accuracy').notNull(),
    sourceIp: text('source_ip').notNull(),
    paidBreak: boolean('paid_break').notNull().default(false),
    idempotencyKey: text('idempotency_key').notNull(),
  },
  (t) => [
    uniqueIndex('attendance_event_retry_uidx').on(
      t.organizationId,
      t.employeeId,
      t.idempotencyKey,
    ),
    index('attendance_event_shift_idx').on(t.shiftId, t.occurredAt),
    index('attendance_event_employee_idx').on(t.employeeId, t.occurredAt),
  ],
);

export interface CorrectedEvent {
  action: AttendanceEventAction;
  occurredAt: string;
  paidBreak?: boolean;
}

export interface EmergencyWork {
  cause: 'disaster' | 'incident' | 'unexpected';
  reportedAt: string;
  makeupStartsAt: string;
  makeupEndsAt: string;
}

export const attendanceRequest = pgTable(
  'attendance_request',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => attendanceEmployee.id),
    shiftId: text('shift_id').references(() => attendanceShift.id),
    kind: attendanceRequestKind('kind').notNull(),
    status: attendanceRequestStatus('status').notNull().default('pending'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    reason: text('reason').notNull(),
    leaveMinutes: integer('leave_minutes'),
    paidPercent: integer('paid_percent'),
    leaveTypeId: text('leave_type_id').references(() => attendanceLeaveType.id),
    parentalMode: text('parental_mode').$type<'daily' | 'continuous'>(),
    originalEndsAt: timestamp('original_ends_at', { withTimezone: true }),
    leaveCaseId: text('leave_case_id').references(() => attendanceLeaveCase.id),
    correctedEvents: jsonb('corrected_events').$type<CorrectedEvent[]>(),
    reviewedBy: text('reviewed_by'),
    reviewReason: text('review_reason'),
    emergency: jsonb('emergency').$type<EmergencyWork>(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('attendance_request_org_idx').on(t.organizationId, t.createdAt),
    index('attendance_request_employee_start_idx').on(t.employeeId, t.startsAt),
    index('attendance_request_shift_idx').on(t.shiftId, t.reviewedAt),
    index('attendance_request_leave_case_idx').on(t.leaveCaseId),
    check('attendance_request_interval', sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

export const attendanceAudit = pgTable(
  'attendance_audit',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    actorId: text('actor_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    resourceId: text('resource_id').notNull(),
    changes: jsonb('changes').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('attendance_audit_org_idx').on(t.organizationId, t.createdAt),
    index('attendance_audit_created_idx').on(t.createdAt),
  ],
);

export const attendanceLeaveType = pgTable(
  'attendance_leave_type',
  {
    id: text('id').primaryKey(),
    statutoryKind: text('statutory_kind')
      .$type<StatutoryLeaveKind>()
      .notNull()
      .default('custom'),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    paidPercent: integer('paid_percent'),
    requiresBalance: boolean('requires_balance'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('attendance_leave_type_statutory_uidx')
      .on(t.organizationId, t.statutoryKind)
      .where(sql`${t.statutoryKind} <> 'custom'`),
    check(
      'attendance_leave_type_custom_rules',
      sql`(${t.statutoryKind} = 'custom') = (${t.paidPercent} IS NOT NULL AND ${t.requiresBalance} IS NOT NULL)`,
    ),
  ],
);

export const attendanceLeaveBalance = pgTable(
  'attendance_leave_balance',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => attendanceEmployee.id),
    leaveTypeId: text('leave_type_id')
      .notNull()
      .references(() => attendanceLeaveType.id),
    year: integer('year').notNull(),
    grantedMinutes: integer('granted_minutes').notNull(),
    usedMinutes: integer('used_minutes').notNull().default(0),
  },
  (t) => [
    uniqueIndex('attendance_leave_balance_uidx').on(
      t.employeeId,
      t.leaveTypeId,
      t.year,
    ),
    check(
      'attendance_leave_balance_nonnegative',
      sql`${t.usedMinutes} >= 0 AND ${t.grantedMinutes} >= ${t.usedMinutes}`,
    ),
  ],
);

export const attendanceTemplate = pgTable('attendance_template', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' }),
  employeeId: text('employee_id')
    .notNull()
    .references(() => attendanceEmployee.id),
  name: text('name').notNull(),
  weekday: integer('weekday').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  nextDay: boolean('next_day').notNull(),
  paidBreak: boolean('paid_break').notNull(),
  breakStartTime: text('break_start_time'),
  breakEndTime: text('break_end_time'),
  dayKind: text('day_kind').$type<AttendanceDayKind>().notNull(),
});

export const attendanceLeaveCase = pgTable(
  'attendance_leave_case',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => attendanceEmployee.id),
    leaveTypeId: text('leave_type_id')
      .notNull()
      .references(() => attendanceLeaveType.id),
    reference: text('reference').notNull(),
    childId: text('child_id').references(() => attendanceParentalChild.id),
    dailyPayCents: text('daily_pay_cents'),
    eventDate: timestamp('event_date', { withTimezone: true }).notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    grantedMinutes: integer('granted_minutes').notNull(),
    paidPercent: integer('paid_percent').notNull(),
    reason: text('reason').notNull(),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('attendance_leave_case_reference_uidx').on(
      t.employeeId,
      t.leaveTypeId,
      t.reference,
    ),
    index('attendance_leave_case_employee_idx').on(
      t.organizationId,
      t.employeeId,
    ),
    check('attendance_leave_case_interval', sql`${t.endsAt} > ${t.startsAt}`),
    check(
      'attendance_leave_case_amount',
      sql`${t.grantedMinutes} > 0 AND ${t.paidPercent} BETWEEN 0 AND 100`,
    ),
  ],
);

export const attendanceParentalChild = pgTable(
  'attendance_parental_child',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => attendanceEmployee.id),
    reference: text('reference').notNull(),
    label: text('label').notNull(),
    birthDate: timestamp('birth_date', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('attendance_parental_child_reference_uidx').on(
      t.organizationId,
      t.employeeId,
      t.reference,
    ),
  ],
);

export const attendanceParentalReturn = pgTable(
  'attendance_parental_return',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    employeeId: text('employee_id')
      .notNull()
      .references(() => attendanceEmployee.id),
    requestId: text('request_id')
      .notNull()
      .references(() => attendanceRequest.id),
    originalStartsAt: timestamp('original_starts_at', {
      withTimezone: true,
    }).notNull(),
    originalEndsAt: timestamp('original_ends_at', {
      withTimezone: true,
    }).notNull(),
    returnsAt: timestamp('returns_at', { withTimezone: true }).notNull(),
    status: text('status')
      .$type<'pending' | 'approved' | 'rejected' | 'withdrawn'>()
      .notNull()
      .default('pending'),
    reason: text('reason').notNull(),
    reviewedBy: text('reviewed_by'),
    reviewReason: text('review_reason'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('attendance_parental_return_pending_uidx')
      .on(t.requestId)
      .where(sql`${t.status} = 'pending'`),
    check(
      'attendance_parental_return_interval',
      sql`${t.originalStartsAt} < ${t.returnsAt} AND ${t.returnsAt} < ${t.originalEndsAt}`,
    ),
    check(
      'attendance_parental_return_status',
      sql`${t.status} IN ('pending', 'approved', 'rejected', 'withdrawn')`,
    ),
  ],
);
