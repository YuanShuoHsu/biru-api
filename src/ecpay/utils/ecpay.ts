import * as crypto from 'crypto';

import { toPlatformTime } from 'src/common/constants/timezone';

export const encryptData = (
  plaintext: string,
  hashKey: string,
  hashIV: string,
): string => {
  const cipher = crypto.createCipheriv(
    'aes-128-cbc',
    Buffer.from(hashKey, 'utf8'),
    Buffer.from(hashIV, 'utf8'),
  );

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  return encrypted;
};

export const decodeUrlEncoded = (value: string): string =>
  decodeURIComponent(value.replace(/\+/g, '%20'));

export const decryptData = (
  base64Data: string,
  hashKey: string,
  hashIV: string,
): string => {
  const decipher = crypto.createDecipheriv(
    'aes-128-cbc',
    Buffer.from(hashKey, 'utf8'),
    Buffer.from(hashIV, 'utf8'),
  );

  let decrypted = decipher.update(base64Data, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

export const ITEM_WORD = '份';

export const toInvoiceDateText = (value: Date): string =>
  toPlatformTime(value).toISOString().slice(0, 10);
