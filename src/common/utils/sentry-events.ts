import type { ErrorEvent } from '@sentry/nestjs';

const DRIZZLE_QUERY_PARAMS = /^(Failed query: [\s\S]*?)\nparams: [\s\S]*$/;

export const withoutSqlParams = (event: ErrorEvent): ErrorEvent => {
  for (const exception of event.exception?.values ?? [])
    if (exception.value)
      exception.value = exception.value.replace(DRIZZLE_QUERY_PARAMS, '$1');
  return event;
};
