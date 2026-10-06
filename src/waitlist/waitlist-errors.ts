import { BadRequestException, ConflictException } from '@nestjs/common';

export const waitlistErrorCodes = [
  'waitlistClosed',
  'waitlistCutoff',
  'waitlistDisabled',
  'waitlistGroupsInvalid',
  'waitlistPartySizeUnavailable',
  'waitlistPaused',
  'waitlistPhoneInQueue',
  'waitlistTransitionInvalid',
] as const;

export type WaitlistErrorCode = (typeof waitlistErrorCodes)[number];

export const badRequestError = (code: WaitlistErrorCode) =>
  new BadRequestException(code);

export const conflictError = (code: WaitlistErrorCode) =>
  new ConflictException(code);
