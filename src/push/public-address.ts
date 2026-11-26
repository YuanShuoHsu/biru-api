// https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html#case-2-application-can-send-requests-to-any-external-ip-address-or-domain-name
import { lookup } from 'node:dns/promises';
import { Agent } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';

import type { LookupAddress } from 'node:dns';

// https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml
const NON_PUBLIC_IPV4: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

// https://www.iana.org/assignments/iana-ipv6-special-registry/iana-ipv6-special-registry.xhtml
const NON_PUBLIC_IPV6: [string, number][] = [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
];

const nonPublic = new BlockList();
for (const [network, prefix] of NON_PUBLIC_IPV4)
  nonPublic.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of NON_PUBLIC_IPV6)
  nonPublic.addSubnet(network, prefix, 'ipv6');

const globalUnicast = new BlockList();
globalUnicast.addSubnet('2000::', 3, 'ipv6');

export const isPublicAddress = (address: string): boolean => {
  const version = isIP(address);
  if (version === 4) return !nonPublic.check(address, 'ipv4');
  return (
    version === 6 &&
    globalUnicast.check(address, 'ipv6') &&
    !nonPublic.check(address, 'ipv6')
  );
};

export const resolvePublicAddresses = async (
  hostname: string,
): Promise<LookupAddress[] | null> => {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.length &&
    addresses.every(({ address }) => isPublicAddress(address))
    ? addresses
    : null;
};

export const pinnedAgent = (addresses: LookupAddress[]): Agent => {
  const pinned: LookupFunction = (_hostname, options, callback) => {
    const wanted =
      options.family === 'IPv4'
        ? 4
        : options.family === 'IPv6'
          ? 6
          : options.family;
    const matching = addresses.filter(
      ({ family }) => !wanted || family === wanted,
    );
    if (!matching.length)
      return callback(
        Object.assign(new Error('No pinned address'), { code: 'ENOTFOUND' }),
        '',
      );
    if (options.all) return callback(null, matching);
    callback(null, matching[0].address, matching[0].family);
  };
  return new Agent({ lookup: pinned });
};
