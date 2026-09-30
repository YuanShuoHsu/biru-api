import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

const encryptionKey = () => {
  const key = Buffer.from(process.env.PII_ENCRYPTION_KEY ?? '', 'base64');
  if (key.length !== KEY_BYTES)
    throw new Error('PII_ENCRYPTION_KEY must be 32 bytes encoded in base64');
  return key;
};

export const encryptField = (plaintext: string) => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString('base64'))
    .join('.');
};

export const decryptField = (payload: string) => {
  const [iv, tag, encrypted] = payload
    .split('.')
    .map((part) => Buffer.from(part, 'base64'));
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
};
