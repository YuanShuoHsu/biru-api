export const pgErrorCode = (error: unknown) =>
  (error as { cause?: { code?: string } } | null | undefined)?.cause?.code;

export const isUniqueViolation = (error: unknown) =>
  pgErrorCode(error) === '23505';

export const isForeignKeyViolation = (error: unknown) =>
  pgErrorCode(error) === '23503';

export const isCheckViolation = (error: unknown) =>
  pgErrorCode(error) === '23514';

// https://www.postgresql.org/docs/current/errcodes-appendix.html
export const isUnstorableText = (error: unknown) =>
  ['22021', '22P05'].includes(pgErrorCode(error) ?? '');

export const pgConstraint = (error: unknown) =>
  (error as { cause?: { constraint?: string } }).cause?.constraint;
