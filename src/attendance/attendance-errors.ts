import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';

export const attendanceErrorCodes = [
  'activeShiftExists',
  'annualLeaveDeferralInUse',
  'annualLeaveDeferralInvalid',
  'belowMinimumWorkingAge',
  'belowStatutoryPaidPercent',
  'calendarLeaveInterval',
  'calendarLeavePayRequired',
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
  'outsideShiftWindow',
  'occupationalIndustryInvalid',
  'overlappingAttendance',
  'overlappingLeave',
  'overlappingOvertimeExtensions',
  'overlappingShift',
  'overtimeAgreementRequired',
  'parentalChildExists',
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

export const badRequestError = (code: AttendanceErrorCode) =>
  new BadRequestException(code);

export const conflictError = (code: AttendanceErrorCode) =>
  new ConflictException(code);

export const forbiddenError = (code: AttendanceErrorCode) =>
  new ForbiddenException(code);

const isAttendanceErrorCode = (value: string): value is AttendanceErrorCode =>
  (attendanceErrorCodes as readonly string[]).includes(value);

export const runBatch = async (
  ids: string[],
  run: (id: string) => Promise<unknown>,
) => {
  const succeeded: string[] = [];
  const skipped: { id: string; reason: AttendanceErrorCode }[] = [];
  for (const id of [...new Set(ids)]) {
    try {
      await run(id);
      succeeded.push(id);
    } catch (error) {
      if (
        !(error instanceof HttpException) ||
        !isAttendanceErrorCode(error.message)
      )
        throw error;
      skipped.push({ id, reason: error.message });
    }
  }
  return { succeeded, skipped };
};
