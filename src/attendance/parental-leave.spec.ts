import {
  parentalLeaveErrors,
  parentalMode,
  type ParentalRecord,
} from './parental-leave';

const at = (date: string) => new Date(`${date}T00:00:00+08:00`);
const child = { id: 'child', eventDate: at('2024-01-01') };
const leave = (id: string, start: string, end: string): ParentalRecord => ({
  id,
  leaveCaseId: child.id,
  startsAt: at(start),
  endsAt: at(end),
});

describe('Parental leave periods and shared limits', () => {
  it('allows the exclusive end at age three and rejects leave on the third birthday', () => {
    expect(
      parentalLeaveErrors([leave('a', '2026-12-31', '2027-01-01')], [child]),
    ).toEqual([]);
    expect(
      parentalLeaveErrors([leave('b', '2027-01-01', '2027-01-02')], [child]),
    ).toContain('invalidParentalInterval');
  });

  it('shares the thirty-day daily allowance across calendar years', () => {
    const records = [
      leave('a', '2025-12-17', '2026-01-01'),
      leave('b', '2026-02-01', '2026-02-16'),
    ];
    expect(parentalLeaveErrors(records, [child])).toEqual([]);
    expect(
      parentalLeaveErrors(
        [...records, leave('c', '2026-03-01', '2026-03-02')],
        [child],
      ),
    ).toContain('parentalDailyLimit');
  });

  it('uses daily units only below thirty calendar days', () => {
    expect(parentalMode(leave('a', '2026-02-01', '2026-03-02'))).toBe('daily');
    expect(parentalMode(leave('a', '2026-02-01', '2026-03-03'))).toBe(
      'continuous',
    );
    expect(
      parentalLeaveErrors(
        [
          leave('a', '2026-01-01', '2026-01-31'),
          leave('b', '2026-03-01', '2026-03-31'),
          leave('c', '2026-05-01', '2026-05-31'),
        ],
        [child],
      ),
    ).toContain('parentalShortLimit');
  });

  it('allows two short continuous periods but rejects a third', () => {
    const records = [
      leave('a', '2026-01-01', '2026-02-01'),
      leave('b', '2026-03-01', '2026-04-01'),
    ];
    expect(parentalLeaveErrors(records, [child])).toEqual([]);
    expect(
      parentalLeaveErrors(
        [...records, leave('c', '2026-05-01', '2026-06-01')],
        [child],
      ),
    ).toContain('parentalShortLimit');
  });

  it('does not count six-month continuous periods against the short-period limit', () => {
    const records = [
      leave('a', '2024-07-01', '2025-01-01'),
      leave('b', '2025-02-01', '2025-03-03'),
      leave('c', '2025-04-01', '2025-05-01'),
    ];
    expect(parentalLeaveErrors(records, [child])).toEqual([]);
  });

  it('allows two years including leap day and rejects an additional day', () => {
    const records = [leave('a', '2024-01-01', '2026-01-01')];
    expect(parentalLeaveErrors(records, [child])).toEqual([]);
    expect(
      parentalLeaveErrors(
        [...records, leave('b', '2026-02-01', '2026-02-02')],
        [child],
      ),
    ).toContain('parentalTotalLimit');
  });

  it('accepts valid continuous leave spanning calendar years', () => {
    expect(
      parentalLeaveErrors([leave('a', '2025-12-01', '2026-06-01')], [child]),
    ).toEqual([]);
  });

  it('rejects missing child cases, pre-birth dates and partial calendar days', () => {
    expect(
      parentalLeaveErrors([leave('a', '2025-01-01', '2025-02-01')], []),
    ).toContain('invalidParentalInterval');
    expect(
      parentalLeaveErrors([leave('b', '2023-12-31', '2024-01-01')], [child]),
    ).toContain('invalidParentalInterval');
    expect(
      parentalLeaveErrors(
        [
          {
            ...leave('c', '2026-01-01', '2026-01-02'),
            startsAt: new Date('2026-01-01T01:00:00+08:00'),
          },
        ],
        [child],
      ),
    ).toContain('invalidParentalInterval');
  });
  it('shares daily and short-period limits across cases for the same child', () => {
    const cases = [
      { ...child, childId: 'canonical' },
      { ...child, id: 'other-case', childId: 'canonical' },
    ];
    expect(
      parentalLeaveErrors(
        [
          leave('a', '2026-01-01', '2026-01-30'),
          {
            ...leave('b', '2026-02-01', '2026-02-03'),
            leaveCaseId: 'other-case',
          },
        ],
        cases,
      ),
    ).toContain('parentalDailyLimit');
    expect(
      parentalLeaveErrors(
        [
          leave('a', '2026-01-01', '2026-02-01'),
          leave('b', '2026-03-01', '2026-04-01'),
          {
            ...leave('c', '2026-05-01', '2026-06-01'),
            leaveCaseId: 'other-case',
          },
        ],
        cases,
      ),
    ).toContain('parentalShortLimit');
  });
  it('keeps twins separate and preserves original continuous classification after early return', () => {
    expect(
      parentalLeaveErrors(
        [
          leave('a', '2026-01-01', '2026-01-31'),
          {
            ...leave('b', '2026-02-01', '2026-03-03'),
            leaveCaseId: 'twin',
          },
        ],
        [
          { ...child, childId: 'one' },
          { ...child, id: 'twin', childId: 'two' },
        ],
      ),
    ).toEqual([]);
    expect(
      parentalLeaveErrors(
        [
          {
            ...leave('a', '2026-01-01', '2026-01-10'),
            originalEndsAt: at('2026-07-01'),
          },
          leave('b', '2026-02-01', '2026-03-03'),
          leave('c', '2026-04-01', '2026-05-01'),
        ],
        [child],
      ),
    ).toEqual([]);
  });
});
