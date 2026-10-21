import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from 'src/generated/i18n.generated';

export const attendanceErrorCodes = [
  'activeShiftExists',
  'annualLeaveDeferralInUse',
  'annualLeaveDeferralInvalid',
  'belowMinimumWorkingAge',
  'belowStatutoryPaidPercent',
  'calendarLeaveInterval',
  'calendarLeavePayRequired',
  'cancelIrreversible',
  'cancelReasonRequired',
  'cannotReviewOwnDraft',
  'cannotReviewSelf',
  'childLaborHoursExceeded',
  'childLaborNightWork',
  'childLaborRestDay',
  'consecutiveWorkdaysExceeded',
  'earningTypeInUse',
  'earningTypeNameTaken',
  'correctionSourceChanged',
  'dailyHoursExceeded',
  'dayKindRequired',
  'emergencyDetailsRequired',
  'employeeInUse',
  'employeeNotInTeam',
  'employeeNotEnabled',
  'employmentInsuranceExemptionInvalid',
  'employmentInsuranceIneligible',
  'employmentInsuranceRequired',
  'employmentWindowConflict',
  'futureCorrection',
  'healthInsuranceExemptionInvalid',
  'healthInsuranceRequired',
  'healthSupplementExemptionInvalid',
  'foreignTaxIdentityRequired',
  'holidayCalendarMissing',
  'holidaySubstituteInvalid',
  'idempotencyConflict',
  'implausibleMinimumWage',
  'inconsistentDayKind',
  'indigenousHolidayInUse',
  'childcareReductionInvalid',
  'indigenousHolidayInvalid',
  'insufficientLeaveBalance',
  'invalidBusinessNumber',
  'invalidEarningType',
  'invalidEmergencyDetails',
  'invalidEventSequence',
  'invalidInterval',
  'invalidIp',
  'invalidLeaveCase',
  'invalidParentalInterval',
  'invalidPayrollState',
  'invalidTaxId',
  'ipNotAllowed',
  'jobSearchLeaveInvalid',
  'laborInsuranceExemptionInvalid',
  'laborInsuranceRequired',
  'leaveCaseExists',
  'leaveCaseGrantRequired',
  'leaveCaseInUse',
  'leaveCaseIntervalConflict',
  'leaveCaseRequired',
  'leaveOutsideShift',
  'leavePolicyRequired',
  'leavePolicyRulesRequired',
  'leaveTypeInUse',
  'locationNotAllowed',
  'maternalNightWork',
  'medicalCertificateRequired',
  'medicalLeaveInterval',
  'memberNotFound',
  'menstrualDayLimit',
  'monthlyOvertimeExceeded',
  'noShifts',
  'outsideShiftWindow',
  'occupationalIndustryInvalid',
  'overlappingAttendance',
  'overlappingLeave',
  'overlappingOvertimeExtensions',
  'overlappingShift',
  'overtimeAgreementRequired',
  'parentalChildExists',
  'parentalChildInUse',
  'parentalChildMismatch',
  'parentalChildRequired',
  'parentalChildUnassigned',
  'parentalDailyLimit',
  'parentalLeaveActive',
  'parentalReturnInvalid',
  'parentalReturnPending',
  'parentalReturnStale',
  'parentalShortLimit',
  'parentalTotalLimit',
  'partTimeLadderRequiresPartTime',
  'payrollBlocked',
  'payrollLocked',
  'payrollRuleSetMissing',
  'payrollSourceChanged',
  'payrollTermsRequired',
  'pendingRequestExists',
  'pensionIneligible',
  'pensionRequired',
  'periodOvertimeExceeded',
  'reasonRequired',
  'requestAlreadyReviewed',
  'reservedMakeupRest',
  'restDayDesignationConflict',
  'scheduledDailyHoursExceeded',
  'settingsRequired',
  'shiftHasCorrection',
  'shiftHasRecords',
  'shiftRequired',
  'shiftRestTooShort',
  'shiftTooLong',
  'shiftTypeNameTaken',
  'shiftTypeTooLong',
  'splitLeaveByYear',
  'statutoryBalanceAutomatic',
  'statutoryLeaveTypeLocked',
  'studentWeeklyHoursExceeded',
  'taxIdentityRequired',
  'terminationProtected',
  'terminationReasonRequired',
  'weeklyRestRequired',
  'withholdingUnitRequired',
  'workPermitRequired',
] as const;

export type AttendanceErrorCode = (typeof attendanceErrorCodes)[number];

const translate = (code: AttendanceErrorCode) =>
  I18nContext.current<I18nTranslations>()?.t(`common.attendance.${code}`) ??
  code;

const errorBody = (code: AttendanceErrorCode) => ({
  code,
  message: translate(code),
});

export const badRequestError = (code: AttendanceErrorCode) =>
  new BadRequestException({ error: 'Bad Request', ...errorBody(code) });

export const conflictError = (code: AttendanceErrorCode) =>
  new ConflictException({ error: 'Conflict', ...errorBody(code) });

export const cancelIrreversibleError = (reason: AttendanceErrorCode) =>
  new ConflictException({
    error: 'Conflict',
    ...errorBody('cancelIrreversible'),
    reason,
    reasonMessage: translate(reason),
  });

export const forbiddenError = (code: AttendanceErrorCode) =>
  new ForbiddenException({ error: 'Forbidden', ...errorBody(code) });

export const attendanceErrorCodeOf = (
  error: unknown,
): AttendanceErrorCode | undefined => {
  if (!(error instanceof HttpException)) return undefined;

  const response = error.getResponse();
  const code =
    typeof response === 'object' && 'code' in response
      ? response.code
      : undefined;

  return attendanceErrorCodes.find((value) => value === code);
};

export const runBatch = async (
  ids: string[],
  run: (id: string) => Promise<unknown>,
) => {
  const succeeded: string[] = [];
  const skipped: {
    id: string;
    message: string;
    reason: AttendanceErrorCode;
  }[] = [];
  for (const id of [...new Set(ids)]) {
    try {
      await run(id);
      succeeded.push(id);
    } catch (error) {
      const reason = attendanceErrorCodeOf(error);
      if (!reason) throw error;
      skipped.push({ id, message: translate(reason), reason });
    }
  }
  return { succeeded, skipped };
};
