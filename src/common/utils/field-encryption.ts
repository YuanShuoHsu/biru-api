import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

// 各用途各自推導金鑰；purpose 改了舊密文就解不開
const FIELD_ENCRYPTION_PURPOSES = {
  payroll: 'biru-payroll-pii-v1',
  quantCredential: 'biru-quant-credential-v1',
} as const;

type FieldEncryptionPurpose = keyof typeof FIELD_ENCRYPTION_PURPOSES;

const encryptionKey = (purpose: FieldEncryptionPurpose) => {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is required');
  const info = FIELD_ENCRYPTION_PURPOSES[purpose];
  return Buffer.from(hkdfSync('sha256', secret, info, info, KEY_BYTES));
};

export const encryptField = (
  plaintext: string,
  purpose: FieldEncryptionPurpose = 'payroll',
) => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(purpose), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString('base64'))
    .join('.');
};

export const decryptField = (
  payload: string,
  purpose: FieldEncryptionPurpose = 'payroll',
) => {
  const [iv, tag, encrypted] = payload
    .split('.')
    .map((part) => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(purpose), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
};
