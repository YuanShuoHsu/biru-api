import {
  canTransition,
  findGroup,
  formatTicketNumber,
  isValidGroups,
} from './waitlist-rules';

const groups = [
  { maxPartySize: 2, minPartySize: 1, prefix: 'A' },
  { maxPartySize: 4, minPartySize: 3, prefix: 'B' },
  { maxPartySize: 10, minPartySize: 5, prefix: 'C' },
];

describe('waitlist rules', () => {
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
    expect(canTransition('seated', 'called')).toBe(false);
    expect(canTransition('cancelled', 'waiting')).toBe(false);
    expect(canTransition('noShow', 'called')).toBe(false);
  });

  it('accepts contiguous groups in any order', () => {
    expect(isValidGroups(groups)).toBe(true);
    expect(isValidGroups([...groups].reverse())).toBe(true);
  });

  it('rejects gaps, overlaps, duplicates and empty groups', () => {
    expect(isValidGroups([])).toBe(false);
    expect(
      isValidGroups([
        { maxPartySize: 2, minPartySize: 1, prefix: 'A' },
        { maxPartySize: 6, minPartySize: 4, prefix: 'B' },
      ]),
    ).toBe(false);
    expect(
      isValidGroups([
        { maxPartySize: 3, minPartySize: 1, prefix: 'A' },
        { maxPartySize: 6, minPartySize: 3, prefix: 'B' },
      ]),
    ).toBe(false);
    expect(
      isValidGroups([
        { maxPartySize: 2, minPartySize: 1, prefix: 'A' },
        { maxPartySize: 4, minPartySize: 3, prefix: 'A' },
      ]),
    ).toBe(false);
    expect(
      isValidGroups([{ maxPartySize: 4, minPartySize: 2, prefix: 'A' }]),
    ).toBe(false);
    expect(
      isValidGroups([{ maxPartySize: 1, minPartySize: 2, prefix: 'A' }]),
    ).toBe(false);
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
});
