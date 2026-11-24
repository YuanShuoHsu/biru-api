// https://docs.sentry.io/platforms/javascript/guides/nestjs/
import 'dotenv/config';

import * as Sentry from '@sentry/nestjs';

import { withoutQueryParams } from './common/utils/sentry-events.js';

const clientIdentityKeys = {
  deny: ['forwarded', '-ip', 'remote-', 'via', '-user'],
};

if (process.env.SENTRY_DSN)
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT,
    beforeSend: withoutQueryParams,
    // https://github.com/getsentry/sentry-javascript/blob/11.16.0/MIGRATION.md#if-you-want-to-keep-the-v10-default-behavior
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: clientIdentityKeys,
        response: clientIdentityKeys,
      },
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
    },
  });
