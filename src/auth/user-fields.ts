import { APIError } from 'better-auth/api';

const OPTIONAL_TEXT_FIELDS = ['lastName', 'phoneNumber'] as const;

export const blankToNull = (value: string | null | undefined) =>
  value?.trim() ? value.trim() : null;

export const normalizeUserFields = <T extends Record<string, unknown>>(
  user: T,
  action: 'create' | 'update',
): T => {
  const data: Record<string, unknown> = { ...user };

  if (action === 'create' || data.firstName !== undefined) {
    const { firstName } = data;
    if (typeof firstName !== 'string' || !firstName.trim())
      throw new APIError('BAD_REQUEST', {
        code: 'FIRST_NAME_REQUIRED',
        message: 'firstName is required',
      });

    data.firstName = firstName.trim();
  }

  for (const field of OPTIONAL_TEXT_FIELDS) {
    const value = data[field];
    if (value === undefined) continue;

    if (value != null && typeof value !== 'string')
      throw new APIError('BAD_REQUEST', {
        message: `${field} must be a string`,
      });

    data[field] = blankToNull(value);
  }

  return data as T;
};
