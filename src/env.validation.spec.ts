import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { envSchema } from './env.validation.js';

const REQUIRED = {
  DATABASE_URL: 'postgres://user:secret@localhost:5432/biru',
  BETTER_AUTH_SECRET: 'better-auth-secret-value',
  BETTER_AUTH_URL: 'http://localhost:3001',
  NEXT_URL: 'http://localhost:3000',
  NEXT_ADMIN_URL: 'http://localhost:3002',
  FALLBACK_LANGUAGE: 'zh-TW',
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  ECPAY_OPERATION_MODE: 'Test',
  ECPAY_BASE_MERCHANT_ID: '3002607',
  ECPAY_BASE_HASH_KEY: 'base-hash-key',
  ECPAY_BASE_HASH_IV: 'base-hash-iv',
  ECPAY_BASE_RETURN_URL: 'https://api.example.com/api/ecpay/return',
  ECPAY_INVOICE_MERCHANT_ID: '2000132',
  ECPAY_INVOICE_HASH_KEY: 'invoice-hash-key',
  ECPAY_INVOICE_HASH_IV: 'invoice-hash-iv',
  MAIL_HOST: 'smtp.example.com',
  MAIL_USER: 'mailer@example.com',
  MAIL_PASS: 'mail-password',
};

const S3 = {
  S3_ENDPOINT: 'https://ref.supabase.co/storage/v1/s3',
  S3_REGION: 'ap-northeast-1',
  S3_ACCESS_KEY_ID: 's3-access-key',
  S3_SECRET_ACCESS_KEY: 's3-secret-key',
  S3_BUCKET: 'images',
  S3_PUBLIC_URL: 'https://ref.supabase.co/storage/v1/object/public/images',
};

const FULL = {
  ...REQUIRED,
  ...S3,
  ECPAY_CREDIT_CHECK_CODE: '59997889',
  TRUSTED_PROXIES: '10.0.0.0/8',
  CLIENT_IP_HEADER: 'CF-Connecting-IP',
  CLIENT_IP_FORWARD_SECRET: 'x'.repeat(32),
  FIELD_ENCRYPTION_KEYS: 'legacy',
  PORT: '3001',
  NODE_ENV: 'production',
  CLAUDE_BIN: '/usr/local/bin/claude',
};

const failing = (env: Record<string, string | undefined>) => {
  const result = envSchema.safeParse(env);
  return result.success
    ? []
    : [...new Set(result.error.issues.map(({ path }) => path.join('.')))];
};

describe('envSchema', () => {
  it('passes a full config and returns every value unchanged', () => {
    expect(envSchema.parse(FULL)).toEqual(FULL);
  });

  it('passes with only the required variables', () => {
    expect(failing(REQUIRED)).toEqual([]);
  });

  it.each(Object.keys(REQUIRED))('fails when %s is missing', (name) => {
    expect(failing({ ...REQUIRED, [name]: undefined })).toEqual([name]);
  });

  it('fails when a required variable is empty', () => {
    expect(failing({ ...REQUIRED, BETTER_AUTH_SECRET: '' })).toEqual([
      'BETTER_AUTH_SECRET',
    ]);
  });

  it('does not need the mail variables when MAIL_PREVIEW is true', () => {
    const env = {
      ...REQUIRED,
      MAIL_PREVIEW: 'true',
      MAIL_HOST: undefined,
      MAIL_USER: undefined,
      MAIL_PASS: undefined,
    };
    expect(failing(env)).toEqual([]);
    expect(failing({ ...env, MAIL_PREVIEW: '1' })).toEqual([
      'MAIL_HOST',
      'MAIL_USER',
      'MAIL_PASS',
    ]);
  });

  it('fails each missing S3 variable when only some are set', () => {
    const { S3_BUCKET: _bucket, S3_PUBLIC_URL: _publicUrl, ...partial } = S3;
    expect(failing({ ...REQUIRED, ...partial })).toEqual([
      'S3_BUCKET',
      'S3_PUBLIC_URL',
    ]);
    expect(failing({ ...REQUIRED, ...S3, S3_REGION: '' })).toEqual([
      'S3_REGION',
    ]);
  });

  it('treats empty S3 variables as unset', () => {
    const empty = Object.fromEntries(Object.keys(S3).map((key) => [key, '']));
    expect(failing({ ...REQUIRED, ...empty })).toEqual([]);
  });

  it.each([
    ['BETTER_AUTH_URL', 'localhost:3001'],
    ['NEXT_URL', 'not a url'],
    ['NEXT_ADMIN_URL', 'ftp://admin.example.com'],
    ['ECPAY_BASE_RETURN_URL', '/api/ecpay/return'],
    ['S3_ENDPOINT', 'ref.supabase.co'],
    ['S3_PUBLIC_URL', 'storage/v1/object/public/images'],
    ['FALLBACK_LANGUAGE', 'zh-HK'],
    ['ECPAY_OPERATION_MODE', 'production'],
    ['PORT', 'abc'],
    ['PORT', '65536'],
    ['CLIENT_IP_FORWARD_SECRET', 'x'.repeat(31)],
  ])('fails when %s is %j', (name, value) => {
    expect(failing({ ...FULL, [name]: value })).toEqual([name]);
  });

  it('counts the forward secret in bytes after trimming and ignores a blank one', () => {
    expect(
      failing({ ...FULL, CLIENT_IP_FORWARD_SECRET: '密'.repeat(11) }),
    ).toEqual([]);
    expect(
      failing({ ...FULL, CLIENT_IP_FORWARD_SECRET: ` ${'x'.repeat(31)} ` }),
    ).toEqual(['CLIENT_IP_FORWARD_SECRET']);
    expect(failing({ ...FULL, CLIENT_IP_FORWARD_SECRET: '  ' })).toEqual([]);
  });
});

describe('ConfigModule with envSchema', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const boot = (env: Record<string, string | undefined>) => {
    for (const name of Object.keys(envSchema.shape))
      vi.stubEnv(name, env[name]);
    return ConfigModule.forRoot({
      ignoreEnvFile: true,
      validationSchema: envSchema,
    });
  };

  it('refuses to start, naming every failing variable without its value', async () => {
    const error = await boot({
      ...REQUIRED,
      ...S3,
      DATABASE_URL: undefined,
      ECPAY_INVOICE_HASH_KEY: undefined,
      NEXT_URL: 'secret-looking-next-url',
      S3_BUCKET: undefined,
      PORT: 'secret-port',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    const { message } = error as Error;
    for (const name of [
      'DATABASE_URL',
      'ECPAY_INVOICE_HASH_KEY',
      'NEXT_URL',
      'S3_BUCKET',
      'PORT',
    ])
      expect(message).toContain(`${name}: `);
    for (const value of [
      'secret-looking-next-url',
      'secret-port',
      REQUIRED.ECPAY_BASE_HASH_KEY,
      S3.S3_SECRET_ACCESS_KEY,
    ])
      expect(message).not.toContain(value);
  });

  it('serves undeclared variables and declared ones as the strings given', async () => {
    vi.stubEnv('JWT_ACCESS_SECRET', 'leftover');
    const moduleRef = await Test.createTestingModule({
      imports: [await boot({ ...FULL, NEXT_URL: ' http://localhost:3000 ' })],
    }).compile();
    const config = moduleRef.get(ConfigService);

    expect(config.get('JWT_ACCESS_SECRET')).toBe('leftover');
    expect(config.get('PORT')).toBe('3001');
    expect(config.get('NEXT_URL')).toBe(' http://localhost:3000 ');
  });
});
