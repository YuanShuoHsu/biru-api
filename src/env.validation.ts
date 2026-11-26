// https://docs.nestjs.com/techniques/configuration#schema-validation
import { z } from 'zod';

import { languagesEnum } from './db/schema/enums.js';

const S3_VARIABLES = [
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
  'S3_BUCKET',
  'S3_PUBLIC_URL',
] as const;

const MAIL_VARIABLES = ['MAIL_HOST', 'MAIL_USER', 'MAIL_PASS'] as const;

const VAPID_VARIABLES = [
  'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_SUBJECT',
] as const;

const isHttpUrl = (value: string) =>
  z.url({ protocol: /^https?$/ }).safeParse(value).success;

const requiredOr =
  (invalid: string) =>
  ({ input }: { input?: unknown }) =>
    input === undefined ? 'is required' : invalid;

const required = z
  .string({ error: 'is required' })
  .min(1, { error: 'is required', abort: true });

const requiredUrl = required.refine(isHttpUrl, 'must be an http(s) URL');

const optionalVapidKey = (bytes: number) =>
  z
    .string()
    .refine(
      (value) =>
        !value ||
        (/^[A-Za-z0-9_-]+$/.test(value) &&
          Buffer.from(value, 'base64url').length === bytes),
      `must be a ${bytes}-byte URL-safe base64 key`,
    )
    .optional();

const optionalUrl = z
  .string()
  .refine((value) => !value || isHttpUrl(value), 'must be an http(s) URL')
  .optional();

export const envSchema = z
  .object({
    DATABASE_URL: required,
    BETTER_AUTH_SECRET: required,
    BETTER_AUTH_URL: requiredUrl,
    NEXT_URL: requiredUrl,
    NEXT_ADMIN_URL: requiredUrl,
    FALLBACK_LANGUAGE: z.enum(languagesEnum.enumValues, {
      error: requiredOr(
        `must be one of ${languagesEnum.enumValues.join(', ')}`,
      ),
    }),
    GOOGLE_CLIENT_ID: required,
    GOOGLE_CLIENT_SECRET: required,
    ECPAY_OPERATION_MODE: z.enum(['Test', 'Production'], {
      error: requiredOr('must be Test or Production'),
    }),
    CRON_ENABLED: z
      .string()
      .refine(
        (value) => !value || value === 'true' || value === 'false',
        'must be true or false',
      )
      .optional(),
    COOKIE_PREFIX: z
      .string()
      .regex(/^[A-Za-z0-9_-]*$/, 'must be letters, digits, - or _')
      .optional(),
    ECPAY_BASE_MERCHANT_ID: required,
    ECPAY_BASE_HASH_KEY: required,
    ECPAY_BASE_HASH_IV: required,
    ECPAY_BASE_RETURN_URL: requiredUrl,
    ECPAY_INVOICE_MERCHANT_ID: required,
    ECPAY_INVOICE_HASH_KEY: required,
    ECPAY_INVOICE_HASH_IV: required,
    ECPAY_CREDIT_CHECK_CODE: z.string().optional(),
    MAIL_PREVIEW: z.string().optional(),
    MAIL_HOST: z.string().optional(),
    MAIL_USER: z.string().optional(),
    MAIL_PASS: z.string().optional(),
    S3_ENDPOINT: optionalUrl,
    S3_REGION: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    S3_BUCKET: z.string().optional(),
    S3_PUBLIC_URL: optionalUrl,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: optionalVapidKey(65),
    VAPID_PRIVATE_KEY: optionalVapidKey(32),
    // https://www.rfc-editor.org/rfc/rfc8292#section-2.1
    VAPID_SUBJECT: z
      .string()
      .refine(
        (value) =>
          !value ||
          /^mailto:[^\s@]+@[^\s@]+$/.test(value) ||
          z.url({ protocol: /^https$/ }).safeParse(value).success,
        'must be a mailto: or https: URL',
      )
      .optional(),
    TRUSTED_PROXIES: z.string().optional(),
    CLIENT_IP_HEADER: z.string().optional(),
    CLIENT_IP_FORWARD_SECRET: z
      .string()
      .refine(
        (value) => !value.trim() || Buffer.byteLength(value.trim()) >= 32,
        'must be at least 32 bytes',
      )
      .optional(),
    FIELD_ENCRYPTION_KEYS: z.string().optional(),
    SENTRY_DSN: optionalUrl,
    SENTRY_ENVIRONMENT: z.string().optional(),
    PORT: z
      .string()
      .regex(/^[1-9]\d*$/, 'must be a port number')
      .refine((value) => Number(value) <= 65535, 'must be a port number')
      .optional(),
    NODE_ENV: z.string().optional(),
    CLAUDE_BIN: z.string().optional(),
  })
  .superRefine(
    (env, ctx) => {
      if (env.MAIL_PREVIEW !== 'true')
        for (const name of MAIL_VARIABLES)
          if (!env[name])
            ctx.addIssue({
              code: 'custom',
              path: [name],
              message: 'is required unless MAIL_PREVIEW is true',
            });
      const unset = S3_VARIABLES.filter((name) => !env[name]);
      if (unset.length && unset.length < S3_VARIABLES.length)
        for (const name of unset)
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: 'is required when any S3 variable is set',
          });
      const unsetVapid = VAPID_VARIABLES.filter((name) => !env[name]);
      if (unsetVapid.length && unsetVapid.length < VAPID_VARIABLES.length)
        for (const name of unsetVapid)
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: 'is required when any VAPID variable is set',
          });
    },
    { when: () => true },
  );
