import {
  canTransition,
  findGroup,
  formatTicketNumber,
  getAutoNoShowAt,
  getHoldUntil,
  isOverdue,
  isRevert,
  isValidGroups,
} from './waitlist-rules';

const groups = [
  { maxPartySize: 2, minPartySize: 1, prefix: 'A' },
  { maxPartySize: 4, minPartySize: 3, prefix: 'B' },
  { maxPartySize: 10, minPartySize: 5, prefix: 'C' },
];

describe('waitlist rules', () => {
  it('allows undoing a mistaken call, no-show or seat', () => {
    expect(canTransition('called', 'waiting')).toBe(true);
    expect(canTransition('noShow', 'called')).toBe(true);
    expect(canTransition('seated', 'called')).toBe(true);
    expect(isRevert('called', 'waiting')).toBe(true);
    expect(isRevert('noShow', 'called')).toBe(true);
    expect(isRevert('seated', 'called')).toBe(true);
    expect(isRevert('waiting', 'called')).toBe(false);
    expect(isRevert('called', 'called')).toBe(false);
    expect(canTransition('seated', 'waiting')).toBe(false);
    expect(canTransition('noShow', 'waiting')).toBe(false);
  });

  it('allows the staff flow and recalling', () => {
    expect(canTransition('waiting', 'called')).toBe(true);
    expect(canTransition('called', 'called')).toBe(true);
    expect(canTransition('called', 'seated')).toBe(true);
    expect(canTransition('called', 'noShow')).toBe(true);
    expect(canTransition('noShow', 'seated')).toBe(true);
    expect(canTransition('waiting', 'seated')).toBe(true);
  });

  it('rejects leaving an ended ticket or skipping before calling', () => {
    expect(canTransition('waiting', 'noShow')).toBe(false);
    expect(canTransition('cancelled', 'waiting')).toBe(false);
  });

  it('accepts contiguous groups in any order', () => {
    expect(isValidGroups(groups)).toBe(true);
    expect(isValidGroups([...groups].reverse())).toBe(true);
  });

  it('rejects gaps, overlaps and empty groups', () => {
    expect(isValidGroups([])).toBe(false);
    expect(
      isValidGroups([
        { maxPartySize: 2, minPartySize: 1 },
        { maxPartySize: 6, minPartySize: 4 },
      ]),
    ).toBe(false);
    expect(
      isValidGroups([
        { maxPartySize: 3, minPartySize: 1 },
        { maxPartySize: 6, minPartySize: 3 },
      ]),
    ).toBe(false);
    expect(isValidGroups([{ maxPartySize: 4, minPartySize: 2 }])).toBe(false);
    expect(isValidGroups([{ maxPartySize: 1, minPartySize: 2 }])).toBe(false);
  });

  it('finds the group by party size', () => {
    expect(findGroup(groups, 1)?.prefix).toBe('A');
    expect(findGroup(groups, 4)?.prefix).toBe('B');
    expect(findGroup(groups, 10)?.prefix).toBe('C');
    expect(findGroup(groups, 11)).toBeUndefined();
  });

  it('pads the ticket number', () => {
    expect(formatTicketNumber('A', 7)).toBe('A007');
    expect(formatTicketNumber('B', 1234)).toBe('B1234');
  });

  it('holds a called ticket for the configured minutes', () => {
    const calledAt = new Date('2026-10-06T12:00:00Z');

    expect(getHoldUntil({ calledAt, status: 'called' }, 10)).toEqual(
      new Date('2026-10-06T12:10:00Z'),
    );
    expect(getHoldUntil({ calledAt, status: 'noShow' }, 10)).toBeNull();
    expect(getHoldUntil({ calledAt: null, status: 'waiting' }, 10)).toBeNull();
  });

  it('flags a called ticket as overdue once the hold passes', () => {
    const ticket = {
      calledAt: new Date('2026-10-07T05:00:00Z'),
      status: 'called' as const,
    };

    expect(isOverdue(ticket, 10, new Date('2026-10-07T05:09:59Z'))).toBe(false);
    expect(isOverdue(ticket, 10, new Date('2026-10-07T05:10:00Z'))).toBe(true);
    expect(
      isOverdue(
        { ...ticket, status: 'seated' },
        10,
        new Date('2026-10-07T06:00:00Z'),
      ),
    ).toBe(false);
  });

  it('auto skips after the hold plus the grace, never when grace is 0', () => {
    const ticket = {
      calledAt: new Date('2026-10-07T05:00:00Z'),
      status: 'called' as const,
    };

    expect(getAutoNoShowAt(ticket, 10, 10)).toEqual(
      new Date('2026-10-07T05:20:00Z'),
    );
    expect(getAutoNoShowAt(ticket, 10, 0)).toBeNull();
  });
});
