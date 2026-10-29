import { randomBytes } from 'node:crypto';

import {
  decryptField,
  encryptField,
  fieldEncryptionKeys,
} from './field-encryption.js';

const key = () => randomBytes(32).toString('base64');

describe('field encryption', () => {
  const v2 = key();

  beforeEach(() => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
    vi.stubEnv('FIELD_ENCRYPTION_KEYS', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps the legacy format and key when no keys are configured', () => {
    const payload = encryptField('A123456789');

    expect(payload.split('.')).toHaveLength(3);
    vi.stubEnv('FIELD_ENCRYPTION_KEYS', `v2:${v2}`);
    expect(decryptField(payload)).toBe('A123456789');
  });

  it('tags new ciphertext with the first key and decrypts it', () => {
    vi.stubEnv('FIELD_ENCRYPTION_KEYS', `v2:${v2}`);
    const payload = encryptField('secret', 'quantCredential');

    expect(payload.split('.')).toHaveLength(4);
    expect(payload.startsWith('v2.')).toBe(true);
    expect(decryptField(payload, 'quantCredential')).toBe('secret');
  });

  it('decrypts older versions after a new key is put first', () => {
    vi.stubEnv('FIELD_ENCRYPTION_KEYS', `v2:${v2}`);
    const payload = encryptField('secret', 'quantAiKey');

    vi.stubEnv('FIELD_ENCRYPTION_KEYS', `v3:${key()},v2:${v2}`);
    expect(encryptField('secret', 'quantAiKey').startsWith('v3.')).toBe(true);
    expect(decryptField(payload, 'quantAiKey')).toBe('secret');
  });

  it('rejects a version that is no longer configured', () => {
    vi.stubEnv('FIELD_ENCRYPTION_KEYS', `v2:${v2}`);
    const payload = encryptField('secret');

    vi.stubEnv('FIELD_ENCRYPTION_KEYS', `v3:${key()}`);
    expect(() => decryptField(payload)).toThrow('v2');
  });

  it.each([
    ['legacy', ''],
    ['versioned', `v2:${v2}`],
  ])('isolates purposes for %s ciphertext', (_, keys) => {
    vi.stubEnv('FIELD_ENCRYPTION_KEYS', keys);
    const payload = encryptField('secret', 'quantCredential');

    expect(() => decryptField(payload, 'quantAiKey')).toThrow();
    expect(() => decryptField(payload, 'payroll')).toThrow();
  });

  it('keeps encrypting the legacy way while legacy is first', () => {
    vi.stubEnv('FIELD_ENCRYPTION_KEYS', `v2:${v2}`);
    const versioned = encryptField('secret');

    vi.stubEnv('FIELD_ENCRYPTION_KEYS', `legacy,v2:${v2}`);
    const payload = encryptField('secret');

    expect(payload.split('.')).toHaveLength(3);
    vi.stubEnv('FIELD_ENCRYPTION_KEYS', '');
    expect(decryptField(payload)).toBe('secret');
    vi.stubEnv('FIELD_ENCRYPTION_KEYS', `legacy,v2:${v2}`);
    expect(decryptField(versioned)).toBe('secret');
  });

  it('needs BETTER_AUTH_SECRET only for legacy ciphertext once a key is first', () => {
    const legacy = encryptField('secret');
    vi.stubEnv('BETTER_AUTH_SECRET', '');
    vi.stubEnv('FIELD_ENCRYPTION_KEYS', `v2:${v2}`);

    expect(decryptField(encryptField('secret'))).toBe('secret');
    expect(() => decryptField(legacy)).toThrow(
      'BETTER_AUTH_SECRET is required',
    );
  });

  it('rejects ciphertext relabelled with another configured version', () => {
    vi.stubEnv('FIELD_ENCRYPTION_KEYS', `v3:${key()},v2:${v2}`);
    const payload = encryptField('secret');

    expect(() => decryptField(payload.replace(/^v3\./, 'v2.'))).toThrow();
  });

  it('rejects a truncated auth tag', () => {
    const [iv, tag, encrypted] = encryptField('secret').split('.');
    const truncated = Buffer.from(tag, 'base64').subarray(0, 12);

    expect(() =>
      decryptField([iv, truncated.toString('base64'), encrypted].join('.')),
    ).toThrow();
  });

  it.each([['a.b'], ['v2.a.b.c.d']])(
    'rejects ciphertext with the wrong number of parts',
    (payload) => {
      expect(() => decryptField(payload)).toThrow('加密欄位格式錯誤');
    },
  );

  it('treats unset or blank keys as not configured', () => {
    expect(fieldEncryptionKeys(undefined)).toBeNull();
    expect(fieldEncryptionKeys('')).toBeNull();
    expect(fieldEncryptionKeys('  ')).toBeNull();
  });

  it.each([
    ['a duplicated version', `v2:${v2},v2:${key()}`],
    ['a version that is not v<number>', `key2:${v2}`],
    ['a key that is not 32 bytes', `v2:${randomBytes(16).toString('base64')}`],
    ['a key that is not base64', `v2:${'!'.repeat(44)}`],
    ['an empty entry', `v2:${v2},`],
    ['a missing key', 'v2'],
    ['a version with a leading zero', `v02:${v2}`],
    ['a duplicated legacy entry', `legacy,v2:${v2},legacy`],
    ['a legacy entry with a key', `legacy:${v2}`],
  ])('rejects %s', (_, keys) => {
    expect(() => fieldEncryptionKeys(keys)).toThrow('FIELD_ENCRYPTION_KEYS');
  });
});
