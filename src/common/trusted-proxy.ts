import type { Request } from 'express';
import { isIP } from 'node:net';
import { compile } from 'proxy-addr';

const invalid = (entry: string) =>
  new Error(`TRUSTED_PROXIES 的「${entry}」不是 IP、CIDR 或 proxy-addr preset`);

export const trustedProxies = (
  value: string | undefined = process.env.TRUSTED_PROXIES,
): false | string[] => {
  const entries = (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!entries.length) return false;
  for (const entry of entries) {
    if (/^\d+$/.test(entry)) throw invalid(entry);
    try {
      compile(entry);
    } catch {
      throw invalid(entry);
    }
  }
  return entries;
};

export const clientIpHeader = () =>
  process.env.CLIENT_IP_HEADER?.trim() || undefined;

export const clientIp = (
  req: Pick<Request, 'headers' | 'ip'>,
): string | undefined => {
  const header = clientIpHeader();
  if (!header) return req.ip;
  const value = req.headers[header.toLowerCase()];
  return typeof value === 'string' && !value.includes('%') && isIP(value)
    ? value
    : undefined;
};
