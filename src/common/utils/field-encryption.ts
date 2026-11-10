import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;
const AUTH_TAG_BYTES = 16;
const LEGACY_VERSION = 'legacy';

// 各用途各自推導金鑰；purpose 改了舊密文就解不開
const FIELD_ENCRYPTION_PURPOSES = {
  payroll: 'biru-payroll-pii-v1',
  quantAiKey: 'biru-quant-ai-key-v1',
  quantCredential: 'biru-quant-credential-v1',
} as const;

type FieldEncryptionPurpose = keyof typeof FIELD_ENCRYPTION_PURPOSES;

const invalidKeyEntry = (index: number, reason: string) =>
  new Error(`FIELD_ENCRYPTION_KEYS 第 ${index + 1} 項${reason}`);

export const fieldEncryptionKeys = (
  value: string | undefined = process.env.FIELD_ENCRYPTION_KEYS,
): Map<string, Buffer | null> | null => {
  if (!value?.trim()) return null;
  const keys = new Map<string, Buffer | null>();
  value.split(',').forEach((entry, index) => {
    const [version, encoded, ...rest] = entry.trim().split(':');
    if (keys.has(version))
      throw invalidKeyEntry(index, `的版本 ${version} 重複`);
    if (version === LEGACY_VERSION && encoded === undefined) {
      keys.set(version, null);
      return;
    }
    if (!/^v[1-9]\d*$/.test(version) || encoded === undefined || rest.length)
      throw invalidKeyEntry(index, '不是 legacy 或 v<數字>:<base64> 格式');
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== KEY_BYTES || key.toString('base64') !== encoded)
      throw invalidKeyEntry(index, `不是 ${KEY_BYTES} bytes 的 base64`);
    keys.set(version, key);
  });
  return keys;
};

const derive = (secret: Buffer | string, purpose: FieldEncryptionPurpose) => {
  const info = FIELD_ENCRYPTION_PURPOSES[purpose];
  return Buffer.from(hkdfSync('sha256', secret, info, info, KEY_BYTES));
};

const legacyEncryptionKey = (purpose: FieldEncryptionPurpose) => {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required');
  return derive(secret, purpose);
};

export const encryptField = (
  plaintext: string,
  purpose: FieldEncryptionPurpose = 'payroll',
) => {
  const [current] = fieldEncryptionKeys() ?? [];
  const versioned = current?.[1]
    ? { version: current[0], key: current[1] }
    : null;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(
    ALGORITHM,
    versioned ? derive(versioned.key, purpose) : legacyEncryptionKey(purpose),
    iv,
    { authTagLength: AUTH_TAG_BYTES },
  );
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const parts = [iv, cipher.getAuthTag(), encrypted].map((part) =>
    part.toString('base64'),
  );
  return (versioned ? [versioned.version, ...parts] : parts).join('.');
};

const decryptionKey = (
  version: string | undefined,
  purpose: FieldEncryptionPurpose,
) => {
  if (version === undefined) return legacyEncryptionKey(purpose);
  const key = fieldEncryptionKeys()?.get(version);
  if (!key) throw new Error(`FIELD_ENCRYPTION_KEYS 沒有 ${version} 金鑰`);
  return derive(key, purpose);
};

export const decryptField = (
  payload: string,
  purpose: FieldEncryptionPurpose = 'payroll',
) => {
  const parts = payload.split('.');
  if (parts.length !== 3 && parts.length !== 4)
    throw new Error('加密欄位格式錯誤');
  const version = parts.length === 4 ? parts.shift() : undefined;
  const [iv, tag, encrypted] = parts.map((part) => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv(
    ALGORITHM,
    decryptionKey(version, purpose),
    iv,
    { authTagLength: AUTH_TAG_BYTES },
  );
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
};
