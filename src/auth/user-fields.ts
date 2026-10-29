import { APIError } from 'better-auth/api';

const OPTIONAL_TEXT_FIELDS = ['lastName', 'phoneNumber'] as const;

export const blankToNull = (value: string | null | undefined) =>
  value?.trim() ? value.trim() : null;

export const normalizeUserFields = <T extends Record<string, unknown>>(
  user: T,
): T => {
  const data: Record<string, unknown> = { ...user };

  if ('firstName' in data) {
    const { firstName } = data;
    if (typeof firstName !== 'string' || !firstName.trim())
      throw new APIError('BAD_REQUEST', {
        code: 'FIRST_NAME_REQUIRED',
        message: 'firstName is required',
      });

    data.firstName = firstName.trim();
  }

  for (const field of OPTIONAL_TEXT_FIELDS) {
    if (!(field in data)) continue;

    const value = data[field];
    if (value != null && typeof value !== 'string')
      throw new APIError('BAD_REQUEST', {
        message: `${field} must be a string`,
      });

    data[field] = blankToNull(value);
  }

  return data as T;
};
