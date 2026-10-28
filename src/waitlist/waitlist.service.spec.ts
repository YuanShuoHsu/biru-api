import { EventEmitter2 } from '@nestjs/event-emitter';

import type { SpecialOpeningHours } from '../common/utils/opening-hours.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { OrderQrService } from '../orders/order-qr.service.js';

import {
  issueWaitlistQrSession,
  verifyWaitlistQrSession,
  waitlistQrToken,
} from './waitlist-qr-token.js';
import { WaitlistService } from './waitlist.service.js';

const ALWAYS_OPEN = null;
const NEVER_OPEN = 'Mo 00:00-00:01';
// 假時鐘是週二 12:00（台北），距打烊 30 分鐘
const CLOSING_SOON = 'Tu 09:00-12:30';

const createService = ({
  openingHours = ALWAYS_OPEN,
  qrSecret = null,
  setting,
  specialHours = [],
  ticket,
}: {
  openingHours?: string | null;
  qrSecret?: string | null;
  specialHours?: SpecialOpeningHours[];
  setting?: {
    enabled: boolean;
    groups: unknown[];
    cutoffMinutes?: number;
    holdMinutes?: number;
    paused: boolean;
  };
  ticket?: Record<string, unknown>;
}) => {
  const db = {
    query: {
      organization: {
        findFirst: vi.fn().mockResolvedValue({ id: 'org', openingHours }),
      },
      organizationQrSecret: {
        findFirst: vi
          .fn()
          .mockResolvedValue(qrSecret ? { secret: qrSecret } : undefined),
      },
      organizationSpecialHours: {
        findMany: vi.fn().mockResolvedValue(specialHours),
      },
      waitlistSetting: { findFirst: vi.fn().mockResolvedValue(setting) },
      waitlistTicket: { findFirst: vi.fn().mockResolvedValue(ticket) },
    },
    transaction: vi.fn(),
    update: vi.fn(),
  };

  return {
    db,
    service: new WaitlistService(
      db as unknown as DrizzleDB,
      new EventEmitter2(),
      new OrderQrService(db as unknown as DrizzleDB),
    ),
  };
};

const dto = { name: '王小明', partySize: 2, phoneNumber: '+886912345678' };
const groups = [{ maxPartySize: 4, minPartySize: 1, prefix: 'A' }];

const openSetting = { enabled: true, groups, paused: false };

describe('WaitlistService.createTicket', () => {
  let qrSession: string;

  beforeAll(() => {
    vi.useFakeTimers({ now: new Date('2026-10-06T04:00:00Z') });
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
    qrSession = issueWaitlistQrSession('org', null).value;
  });

  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it.each([
    [
      'waitlistDisabled',
      { enabled: false, groups, paused: false },
      ALWAYS_OPEN,
    ],
    ['waitlistPaused', { enabled: true, groups, paused: true }, ALWAYS_OPEN],
    ['waitlistClosed', { enabled: true, groups, paused: false }, NEVER_OPEN],
    ['waitlistCutoff', { enabled: true, groups, paused: false }, CLOSING_SOON],
  ])(
    'rejects with %s before asking for a QR session',
    async (code, setting, openingHours) => {
      const { db, service } = createService({ openingHours, setting });

      await expect(
        service.createTicket('slug', dto, null, 'zh-TW', null, false),
      ).rejects.toThrow(code);
      expect(db.transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects with waitlistClosed on a closed special day', async () => {
    const { db, service } = createService({
      setting: { enabled: true, groups, paused: false },
      specialHours: [
        {
          openingHours: null,
          validFrom: '2026-10-06',
          validThrough: '2026-10-06',
        },
      ],
    });

    await expect(
      service.createTicket('slug', dto, null, 'zh-TW', null, false, qrSession),
    ).rejects.toThrow('waitlistClosed');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it.each([0, 30])(
    'lets customers in when the cutoff is %i minutes',
    async (cutoffMinutes) => {
      const { db, service } = createService({
        openingHours: CLOSING_SOON,
        setting: { cutoffMinutes, enabled: true, groups, paused: false },
      });
      db.transaction.mockRejectedValue(new Error('reached transaction'));

      await expect(
        service.createTicket(
          'slug',
          dto,
          null,
          'zh-TW',
          null,
          false,
          qrSession,
        ),
      ).rejects.toThrow('reached transaction');
    },
  );

  it('rejects a party size outside every group', async () => {
    const { service } = createService({
      setting: { enabled: true, groups, paused: false },
    });

    await expect(
      service.createTicket(
        'slug',
        { ...dto, partySize: 5 },
        null,
        'zh-TW',
        null,
        false,
        qrSession,
      ),
    ).rejects.toThrow('waitlistPartySizeUnavailable');
  });

  it.each([
    ['no session', null, () => undefined],
    ['a tampered session', null, () => `${qrSession.split('.')[0]}.forged`],
    [
      "another organization's session",
      null,
      () => issueWaitlistQrSession('other-org', null).value,
    ],
    [
      'an expired session',
      null,
      () => {
        vi.setSystemTime(new Date('2026-10-06T01:59:00Z'));
        const value = issueWaitlistQrSession('org', null).value;
        vi.setSystemTime(new Date('2026-10-06T04:00:00Z'));
        return value;
      },
    ],
    [
      'a session signed before the secret was rotated',
      'rotated-secret',
      () => qrSession,
    ],
  ])('rejects a guest with %s', async (_, qrSecret, value) => {
    const { db, service } = createService({ qrSecret, setting: openSetting });

    await expect(
      service.createTicket('slug', dto, null, 'zh-TW', null, false, value()),
    ).rejects.toThrow('waitlistQrRequired');
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('accepts a session signed with the rotated secret', async () => {
    const { db, service } = createService({
      qrSecret: 'rotated-secret',
      setting: openSetting,
    });
    db.transaction.mockRejectedValue(new Error('reached transaction'));

    await expect(
      service.createTicket(
        'slug',
        dto,
        null,
        'zh-TW',
        null,
        false,
        issueWaitlistQrSession('org', 'rotated-secret').value,
      ),
    ).rejects.toThrow('reached transaction');
  });

  it('replays an existing ticket without a session', async () => {
    const { db, service } = createService({
      setting: openSetting,
      ticket: {
        calledAt: null,
        confirmedAt: null,
        id: 't',
        number: 1,
        organizationId: 'org',
        prefix: 'A',
        status: 'called',
      },
    });

    await expect(
      service.createTicket('slug', dto, null, 'zh-TW', 'key', false),
    ).resolves.toMatchObject({ id: 't', ticketNumber: 'A001' });
    expect(db.transaction).not.toHaveBeenCalled();
  });
});

describe('WaitlistService.createTicket by staff', () => {
  beforeAll(() => {
    vi.useFakeTimers({ now: new Date('2026-10-06T04:00:00Z') });
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it.each([
    ['paused', { enabled: true, groups, paused: true }, ALWAYS_OPEN],
    ['closed', { enabled: true, groups, paused: false }, NEVER_OPEN],
    ['cutoff', { enabled: true, groups, paused: false }, CLOSING_SOON],
  ])(
    'passes the %s check through to numbering',
    async (_, setting, openingHours) => {
      const { db, service } = createService({ openingHours, setting });
      db.transaction.mockRejectedValue(new Error('reached transaction'));

      await expect(
        service.createTicket('slug', dto, null, 'zh-TW', null, true),
      ).rejects.toThrow('reached transaction');
    },
  );

  it('does not require a QR session', async () => {
    const { db, service } = createService({ setting: openSetting });
    db.transaction.mockRejectedValue(new Error('reached transaction'));

    await expect(
      service.createTicket('slug', dto, null, 'zh-TW', null, true),
    ).rejects.toThrow('reached transaction');
    expect(db.query.organizationQrSecret.findFirst).not.toHaveBeenCalled();
    expect(db.query.organizationSpecialHours.findMany).not.toHaveBeenCalled();
  });

  it('still rejects when the waitlist is disabled', async () => {
    const { service } = createService({
      setting: { enabled: false, groups, paused: false },
    });

    await expect(
      service.createTicket('slug', dto, null, 'zh-TW', null, true),
    ).rejects.toThrow('waitlistDisabled');
  });
});

describe('WaitlistService.cancelTicket', () => {
  it('refuses to cancel a ticket that has ended', async () => {
    const { service } = createService({
      ticket: { id: 't', organizationId: 'org', status: 'seated' },
    });

    await expect(service.cancelTicket('slug', 't')).rejects.toThrow(
      'waitlistTransitionInvalid',
    );
  });
});

describe('WaitlistService.confirmTicket', () => {
  it.each(['waiting', 'noShow', 'seated', 'cancelled'])(
    'refuses to confirm a %s ticket',
    async (status) => {
      const { db, service } = createService({
        ticket: { id: 't', organizationId: 'org', status },
      });

      await expect(service.confirmTicket('slug', 't')).rejects.toThrow(
        'waitlistTransitionInvalid',
      );
      expect(db.update).not.toHaveBeenCalled();
    },
  );

  it('returns an already confirmed ticket without writing again', async () => {
    const confirmedAt = new Date('2026-10-06T12:01:00Z');
    const { db, service } = createService({
      setting: { enabled: true, groups, holdMinutes: 15, paused: false },
      ticket: {
        calledAt: new Date('2026-10-06T12:00:00Z'),
        confirmedAt,
        id: 't',
        number: 3,
        organizationId: 'org',
        prefix: 'A',
        status: 'called',
      },
    });

    await expect(service.confirmTicket('slug', 't')).resolves.toMatchObject({
      confirmedAt,
      holdUntil: new Date('2026-10-06T12:15:00Z'),
      ticketNumber: 'A003',
    });
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('WaitlistService.getPublicStatusByOrganizationId', () => {
  const selectReturning = (rows: unknown[]) =>
    vi.fn(() => ({
      from: () => ({ where: () => ({ orderBy: () => Promise.resolve(rows) }) }),
    }));

  it('shows the latest called number and waiting count per group', async () => {
    const { db, service } = createService({
      setting: {
        enabled: true,
        groups: [
          { maxPartySize: 2, minPartySize: 1, prefix: 'A' },
          { maxPartySize: 4, minPartySize: 3, prefix: 'B' },
        ],
        paused: false,
      },
    });
    Object.assign(db, {
      select: selectReturning([
        { calledAt: null, number: 5, prefix: 'A', status: 'waiting' },
        { calledAt: null, number: 6, prefix: 'A', status: 'waiting' },
        {
          calledAt: new Date('2026-10-06T04:10:00Z'),
          number: 4,
          prefix: 'A',
          status: 'called',
        },
        {
          calledAt: new Date('2026-10-06T04:00:00Z'),
          number: 3,
          prefix: 'A',
          status: 'seated',
        },
      ]),
    });

    await expect(
      service.getPublicStatusByOrganizationId('org'),
    ).resolves.toMatchObject({
      enabled: true,
      groups: [
        { currentTicketNumber: 'A004', prefix: 'A', waitingCount: 2 },
        { currentTicketNumber: null, prefix: 'B', waitingCount: 0 },
      ],
      paused: false,
    });
  });

  it("applies and returns today's special hours only", async () => {
    vi.useFakeTimers({ now: new Date('2026-10-06T04:00:00Z') });
    const today = {
      id: 'today',
      note: '颱風停業',
      openingHours: null,
      validFrom: '2026-10-06',
      validThrough: '2026-10-06',
    };
    const { db, service } = createService({
      setting: { enabled: true, groups: [], paused: false },
      specialHours: [
        {
          id: 'yesterday',
          note: null,
          openingHours: null,
          validFrom: '2026-10-05',
          validThrough: '2026-10-05',
        },
        today,
      ] as SpecialOpeningHours[],
    });
    Object.assign(db, { select: selectReturning([]) });

    await expect(
      service.getPublicStatusByOrganizationId('org'),
    ).resolves.toMatchObject({ open: false, specialHours: [today] });
    vi.useRealTimers();
  });

  it('rejects an unknown organization', async () => {
    const { db, service } = createService({});
    db.query.organization.findFirst.mockResolvedValue(undefined);
    Object.assign(db, { select: selectReturning([]) });

    await expect(
      service.getPublicStatusByOrganizationId('missing'),
    ).rejects.toThrow('Organization not found');
  });
});

describe('WaitlistService.getTicket', () => {
  it('combines the hold deadline, queue position and current number', async () => {
    const { db, service } = createService({
      setting: { enabled: true, groups, holdMinutes: 10, paused: false },
      ticket: {
        calledAt: new Date('2026-10-06T12:00:00Z'),
        confirmedAt: null,
        id: 't',
        number: 3,
        organizationId: 'org',
        prefix: 'A',
        status: 'called',
      },
    });
    Object.assign(db, {
      select: vi.fn(() => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => Promise.resolve([{ number: 4, prefix: 'A' }]),
            }),
          }),
        }),
      })),
    });

    await expect(service.getTicket('slug', 't')).resolves.toMatchObject({
      aheadCount: 0,
      currentTicketNumber: 'A004',
      holdUntil: new Date('2026-10-06T12:10:00Z'),
      ticketNumber: 'A003',
    });
  });
});

describe('WaitlistService.scanQr', () => {
  beforeEach(() => {
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const withOrgRows = (rows: unknown[]) => {
    const { db, service } = createService({});
    const query = {
      from: () => query,
      leftJoin: () => query,
      limit: () => Promise.resolve(rows),
      where: () => query,
    };
    Object.assign(db, { select: vi.fn(() => query) });
    return service;
  };

  it('issues a session and redirects an old slug to the current one', async () => {
    const service = withOrgRows([{ id: 'org', secret: null, slug: 'shop' }]);

    const scanned = await service.scanQr(
      'old-shop',
      waitlistQrToken('org', null),
    );

    expect(scanned?.slug).toBe('shop');
    expect(
      verifyWaitlistQrSession('org', null, scanned?.issued?.value),
    ).not.toBeNull();
  });

  it('refuses a token signed with a rotated-out secret', async () => {
    const service = withOrgRows([
      { id: 'org', secret: 'new-secret', slug: 'shop' },
    ]);

    await expect(
      service.scanQr('shop', waitlistQrToken('org', null)),
    ).resolves.toEqual({ issued: null, slug: 'shop' });
  });

  it('redirects without a session when the token is missing', async () => {
    const service = withOrgRows([{ id: 'org', secret: null, slug: 'shop' }]);

    await expect(service.scanQr('shop', undefined)).resolves.toEqual({
      issued: null,
      slug: 'shop',
    });
  });

  it('returns null for an unknown organization', async () => {
    await expect(withOrgRows([]).scanQr('missing', 'x')).resolves.toBeNull();
  });
});
