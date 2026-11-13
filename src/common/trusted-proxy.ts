import type { Request } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
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

const clientIpHeader = () => process.env.CLIENT_IP_HEADER?.trim() || undefined;

const singleIp = (value: string | string[] | undefined) =>
  typeof value === 'string' && !value.includes('%') && isIP(value)
    ? value
    : undefined;

const sha256 = (value: string) => createHash('sha256').update(value).digest();

export const forwardedClientIp = (req: Pick<Request, 'headers'>) => {
  const secret = process.env.CLIENT_IP_FORWARD_SECRET?.trim();
  const sent = req.headers['x-client-ip-forward-secret'];
  if (!secret || typeof sent !== 'string') return undefined;
  if (!timingSafeEqual(sha256(sent), sha256(secret))) return undefined;
  return singleIp(req.headers['x-forwarded-client-ip']);
};

export const clientIp = (
  req: Pick<Request, 'headers' | 'ip'>,
): string | undefined => {
  const header = clientIpHeader();
  if (!header) return req.ip;
  return singleIp(req.headers[header.toLowerCase()]);
};

export const rateLimitEnabled = () => !!clientIpHeader() || !!trustedProxies();

export const rateLimitClientIp = (req: Pick<Request, 'headers' | 'ip'>) =>
  forwardedClientIp(req) ?? clientIp(req);

export const AUTH_CLIENT_IP_HEADER = 'x-biru-client-ip';

export const setAuthClientIpHeader = (req: Pick<Request, 'headers' | 'ip'>) => {
  delete req.headers[AUTH_CLIENT_IP_HEADER];
  if (!rateLimitEnabled()) return;
  const ip = rateLimitClientIp(req);
  if (ip) req.headers[AUTH_CLIENT_IP_HEADER] = ip;
};
