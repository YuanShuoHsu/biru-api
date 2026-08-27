import * as crypto from 'crypto';

import { toPlatformTime } from 'src/common/constants/timezone';

export class EcpayRejectedError extends Error {
  name = 'EcpayRejectedError';
}

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

export const toGetIssueQuery = (data: {
  invoiceDate: Date | null;
  invoiceNumber: string | null;
  relateNumber: string | null;
}):
  | { InvoiceDate: string; InvoiceNo: string }
  | { RelateNumber: string }
  | null => {
  if (data.relateNumber) return { RelateNumber: data.relateNumber };
  if (!data.invoiceNumber || !data.invoiceDate) return null;

  return {
    InvoiceDate: toInvoiceDateText(data.invoiceDate),
    InvoiceNo: data.invoiceNumber,
  };
};

export const QUERY_INTERVAL_MS = 300;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
