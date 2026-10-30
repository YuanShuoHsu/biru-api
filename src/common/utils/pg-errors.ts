export const pgErrorCode = (error: unknown) =>
  (error as { cause?: { code?: string } }).cause?.code;

export const isUniqueViolation = (error: unknown) =>
  pgErrorCode(error) === '23505';
