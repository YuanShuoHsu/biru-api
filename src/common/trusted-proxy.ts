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
