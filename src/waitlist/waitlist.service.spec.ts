import { EventEmitter2 } from '@nestjs/event-emitter';

import type { DrizzleDB } from 'src/drizzle/drizzle.module';

import { WaitlistService } from './waitlist.service';

const ALWAYS_OPEN = null;
const NEVER_OPEN = 'Mo 00:00-00:01';

const createService = ({
  openingHours = ALWAYS_OPEN,
  setting,
  ticket,
}: {
  openingHours?: string | null;
  setting?: {
    enabled: boolean;
    groups: unknown[];
    holdMinutes?: number;
    paused: boolean;
  };
  ticket?: Record<string, unknown>;
}) => {
  const db = {
    query: {
      organization: {
        findFirst: jest.fn().mockResolvedValue({ id: 'org', openingHours }),
      },
      waitlistSetting: { findFirst: jest.fn().mockResolvedValue(setting) },
      waitlistTicket: { findFirst: jest.fn().mockResolvedValue(ticket) },
    },
    transaction: jest.fn(),
    update: jest.fn(),
  };

  return {
    db,
    service: new WaitlistService(
      db as unknown as DrizzleDB,
      new EventEmitter2(),
    ),
  };
};

const dto = { name: '王小明', partySize: 2, phoneNumber: '+886912345678' };
const groups = [{ maxPartySize: 4, minPartySize: 1, prefix: 'A' }];

describe('WaitlistService.createTicket', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-10-06T04:00:00Z') });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it.each([
    [
      'waitlistDisabled',
      { enabled: false, groups, paused: false },
      ALWAYS_OPEN,
    ],
    ['waitlistPaused', { enabled: true, groups, paused: true }, ALWAYS_OPEN],
    ['waitlistClosed', { enabled: true, groups, paused: false }, NEVER_OPEN],
  ])('rejects with %s', async (code, setting, openingHours) => {
    const { db, service } = createService({ openingHours, setting });

    await expect(
      service.createTicket('slug', dto, null, 'zh-TW', null, false),
    ).rejects.toThrow(code);
    expect(db.transaction).not.toHaveBeenCalled();
  });

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
      ),
    ).rejects.toThrow('waitlistPartySizeUnavailable');
  });
});

describe('WaitlistService.createTicket by staff', () => {
  beforeAll(() => {
    jest.useFakeTimers({ now: new Date('2026-10-06T04:00:00Z') });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it.each([
    ['paused', { enabled: true, groups, paused: true }, ALWAYS_OPEN],
    ['closed', { enabled: true, groups, paused: false }, NEVER_OPEN],
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
