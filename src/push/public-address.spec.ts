import { request } from 'node:https';
import { createServer, type LookupFunction } from 'node:net';

import {
  isPublicAddress,
  pinnedAgent,
  resolvePublicAddresses,
} from './public-address.js';

describe('isPublicAddress', () => {
  it.each([
    '8.8.8.8',
    '142.250.196.10',
    '17.253.144.10',
    '2001:4860:4860::8888',
    '2a00:1450:4001:82a::200a',
  ])('accepts the public address %s', (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.8',
    '192.0.2.1',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:8.8.8.8',
    '::ffff:7f00:1',
    '::127.0.0.1',
    '64:ff9b::a00:1',
    '100::1',
    '2001::1',
    '2001:db8::1',
    '2002:a00:1::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'fec0::1',
    'ff02::1',
    'push.example.com',
    '',
  ])('rejects %s', (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
});

describe('resolvePublicAddresses', () => {
  it('rejects a host that resolves to loopback', async () => {
    expect(await resolvePublicAddresses('localhost')).toBeNull();
  });
});

describe('pinnedAgent', () => {
  const addresses = [
    { address: '203.0.114.1', family: 4 },
    { address: '2001:4860::1', family: 6 },
  ];
  const lookupOf = (agent: ReturnType<typeof pinnedAgent>) =>
    (agent.options as { lookup: LookupFunction }).lookup;

  it('answers every lookup with the pinned addresses only', () => {
    const lookup = lookupOf(pinnedAgent(addresses));
    const callback = vi.fn();

    lookup('rebound.example.com', { all: true }, callback);
    lookup('rebound.example.com', { family: 6 }, callback);
    lookup('rebound.example.com', { family: 'IPv4' }, callback);

    expect(callback.mock.calls).toEqual([
      [null, addresses],
      [null, '2001:4860::1', 6],
      [null, '203.0.114.1', 4],
    ]);
  });

  it('fails a lookup for a family it has no pinned address of', () => {
    const lookup = lookupOf(pinnedAgent([addresses[0]]));
    const callback = vi.fn();

    lookup('push.example.com', { family: 6 }, callback);

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ENOTFOUND' }),
      '',
    );
  });

  it('connects to the pinned address instead of resolving the host', async () => {
    const server = createServer((socket) => socket.destroy());
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const { port } = server.address() as { port: number };
    const connected = new Promise<void>((resolve) =>
      server.once('connection', () => resolve()),
    );
    const agent = pinnedAgent([{ address: '127.0.0.1', family: 4 }]);

    const req = request(`https://push.invalid:${port}/`, { agent });
    req.on('error', () => undefined);
    req.end();

    await connected;
    agent.destroy();
    await new Promise((resolve) => server.close(resolve));
  });
});
