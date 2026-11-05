import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateAttendanceHolidaySubstituteDto } from './attendance-holiday-substitute.dto.js';
import { AttendanceShiftRangeQueryDto } from './attendance-shift-range-query.dto.js';
import { CopyAttendanceWeekDto } from './copy-attendance-week.dto.js';
import { CreateAttendanceAnnualLeaveDeferralDto } from './create-attendance-annual-leave-deferral.dto.js';
import { CreateAttendanceLeaveCaseDto } from './create-attendance-leave-case.dto.js';
import { CreateAttendanceParentalChildDto } from './create-attendance-parental-child.dto.js';
import { CreateAttendanceParentalReturnDto } from './create-attendance-parental-return.dto.js';
import { CreateAttendancePunchDto } from './create-attendance-punch.dto.js';
import {
  CorrectedEventDto,
  CreateAttendanceRequestDto,
} from './create-attendance-request.dto.js';
import { CreateAttendanceShiftDto } from './create-attendance-shifts.dto.js';
import { ReviewAttendanceExtraWorkDto } from './review-attendance-extra-work.dto.js';
import {
  EmergencyWorkDto,
  ReviewLeaveCaseDto,
} from './review-attendance-request.dto.js';
import {
  DatePeriodDto,
  SaveAttendanceEmployeeDto,
} from './save-attendance-employee.dto.js';
import { SaveAttendanceSettingsDto } from './save-attendance-settings.dto.js';

const UUID = '0b9e4a52-6f1c-4d3a-9b8e-2c7f5a1d3e4b';
const INSTANT = '2026-10-31T16:00:00.000Z';
const DATE = '2026-11-01';

type Case = [
  name: string,
  cls: new () => object,
  base: Record<string, unknown>,
  fields: string[],
];

const instantCases: Case[] = [
  [
    'AttendanceShiftRangeQueryDto',
    AttendanceShiftRangeQueryDto,
    { from: INSTANT, to: INSTANT },
    ['from', 'to'],
  ],
  [
    'CreateAttendanceAnnualLeaveDeferralDto',
    CreateAttendanceAnnualLeaveDeferralDto,
    { employeeId: UUID, periodStart: INSTANT, reason: '延後' },
    ['periodStart'],
  ],
  [
    'CreateAttendanceLeaveCaseDto',
    CreateAttendanceLeaveCaseDto,
    {
      employeeId: UUID,
      leaveTypeId: UUID,
      eventDate: INSTANT,
      startsAt: INSTANT,
      endsAt: INSTANT,
      reason: '事件假',
    },
    ['eventDate', 'startsAt', 'endsAt'],
  ],
  [
    'CreateAttendanceParentalChildDto',
    CreateAttendanceParentalChildDto,
    { employeeId: UUID, reference: 'A1', label: '老大', birthDate: INSTANT },
    ['birthDate'],
  ],
  [
    'CreateAttendanceParentalReturnDto',
    CreateAttendanceParentalReturnDto,
    { returnsAt: INSTANT, reason: '復職' },
    ['returnsAt'],
  ],
  [
    'CreateAttendancePunchDto',
    CreateAttendancePunchDto,
    {
      shiftId: UUID,
      idempotencyKey: UUID,
      action: 'clockIn',
      latitude: 25,
      longitude: 121,
      accuracy: 10,
      locatedAt: INSTANT,
    },
    ['locatedAt'],
  ],
  [
    'CorrectedEventDto',
    CorrectedEventDto,
    { action: 'clockIn', occurredAt: INSTANT },
    ['occurredAt'],
  ],
  [
    'CreateAttendanceRequestDto',
    CreateAttendanceRequestDto,
    { kind: 'leave', startsAt: INSTANT, endsAt: INSTANT, reason: '家中有事' },
    ['startsAt', 'endsAt'],
  ],
  [
    'CreateAttendanceShiftDto',
    CreateAttendanceShiftDto,
    { employeeId: UUID, startsAt: INSTANT, endsAt: INSTANT },
    ['startsAt', 'endsAt'],
  ],
  [
    'ReviewAttendanceExtraWorkDto',
    ReviewAttendanceExtraWorkDto,
    { status: 'approved', startsAt: INSTANT, endsAt: INSTANT },
    ['startsAt', 'endsAt'],
  ],
  [
    'EmergencyWorkDto',
    EmergencyWorkDto,
    {
      cause: 'incident',
      reportedAt: INSTANT,
      makeupStartsAt: INSTANT,
      makeupEndsAt: INSTANT,
    },
    ['reportedAt', 'makeupStartsAt', 'makeupEndsAt'],
  ],
  [
    'ReviewLeaveCaseDto',
    ReviewLeaveCaseDto,
    { reference: 'A1', eventDate: INSTANT, startsAt: INSTANT, endsAt: INSTANT },
    ['eventDate', 'startsAt', 'endsAt'],
  ],
  [
    'SaveAttendanceEmployeeDto',
    SaveAttendanceEmployeeDto,
    {
      userId: 'user',
      birthDate: '2000-01-01',
      legalStatus: 'national',
      studentVacations: [],
      workPermits: [],
      pregnancyPeriods: [],
      nursingPeriods: [],
      childcareReductionPeriods: [],
      indigenousHolidays: [],
      hiredAt: INSTANT,
      terminatedAt: INSTANT,
      terminationNoticedAt: INSTANT,
    },
    ['hiredAt', 'terminatedAt', 'terminationNoticedAt'],
  ],
];

const dateCases: Case[] = [
  [
    'CreateAttendanceHolidaySubstituteDto',
    CreateAttendanceHolidaySubstituteDto,
    { employeeId: UUID, holidayDate: DATE, shiftId: UUID },
    ['holidayDate'],
  ],
  [
    'CopyAttendanceWeekDto',
    CopyAttendanceWeekDto,
    { from: DATE, weeks: 1 },
    ['from'],
  ],
  ['DatePeriodDto', DatePeriodDto, { from: DATE, to: DATE }, ['from', 'to']],
  [
    'SaveAttendanceEmployeeDto',
    SaveAttendanceEmployeeDto,
    {
      ...instantCases.find(
        ([name]) => name === 'SaveAttendanceEmployeeDto',
      )![2],
      birthDate: DATE,
      taiwanStaySince: DATE,
    },
    ['birthDate', 'taiwanStaySince'],
  ],
  [
    'SaveAttendanceSettingsDto',
    SaveAttendanceSettingsDto,
    {
      latitude: 25,
      longitude: 121,
      radiusMeters: 100,
      allowedIps: ['203.0.113.7'],
      graceMinutes: 5,
      overtimeExtensionPeriods: [],
      overtimeAgreedFrom: DATE,
      paydayNextMonth: false,
    },
    ['overtimeAgreedFrom'],
  ],
];

const errorsOf = async (
  cls: new () => object,
  base: Record<string, unknown>,
  fields: Record<string, unknown> = {},
) =>
  (await validate(plainToInstance(cls, { ...base, ...fields }))).map(
    ({ property }) => property,
  );

describe('attendance date fields', () => {
  describe.each(instantCases)('%s', (_, cls, base, fields) => {
    it.each(fields)('%s 接受 UTC 與 +08:00 時間', async (field) => {
      expect(await errorsOf(cls, base)).toEqual([]);
      expect(
        await errorsOf(cls, base, { [field]: '2026-11-01T00:00:00+08:00' }),
      ).toEqual([]);
    });

    it.each(
      fields.flatMap((field) =>
        [
          '2026-11-01',
          '2026-11-01T09:00:00',
          '2026-W01',
          '2026-123',
          '2026-02-30T00:00:00+08:00',
          '2026-12-31T23:59:60Z',
        ].map((value) => [field, value]),
      ),
    )('%s 拒絕 %s', async (field, value) => {
      expect(await errorsOf(cls, base, { [field]: value })).toEqual([field]);
    });
  });

  describe.each(dateCases)('%s', (_, cls, base, fields) => {
    it.each(fields)('%s 接受 YYYY-MM-DD', async () => {
      expect(await errorsOf(cls, base)).toEqual([]);
    });

    it.each(
      fields.flatMap((field) =>
        ['2026-02-30', '2026-13-45', INSTANT].map((value) => [field, value]),
      ),
    )('%s 拒絕 %s', async (field, value) => {
      expect(await errorsOf(cls, base, { [field]: value })).toEqual([field]);
    });
  });

  it('indigenousHolidays 拒絕不存在的日期', async () => {
    const [, cls, base] = dateCases[3];
    expect(
      await errorsOf(cls, base, { indigenousHolidays: [DATE, '2026-02-30'] }),
    ).toEqual(['indigenousHolidays']);
  });
});
