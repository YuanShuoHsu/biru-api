import {
  medicalLedger,
  medicalPaidSeconds,
  type MedicalRecord,
} from './medical-leave';

const at = (day: string, hour = '09') => new Date(`${day}T${hour}:00:00+08:00`);
const leave = (
  id: string,
  day: string,
  kind: MedicalRecord['kind'] = 'sick',
): MedicalRecord => ({ id, kind, startsAt: at(day), endsAt: at(day, '17') });
const shiftsFor = (records: MedicalRecord[]) =>
  records.map((record) => ({ ...record, dayKind: 'workday' }));
describe('Medical leave quota and wage allocation', () => {
  it('measures a morning off against working hours, not the lunch break', () => {
    const record: MedicalRecord = {
      id: 'morning',
      kind: 'sick',
      startsAt: at('2026-03-02'),
      endsAt: at('2026-03-02', '13'),
    };
    const shift = {
      startsAt: at('2026-03-02'),
      endsAt: at('2026-03-02', '18'),
      breakStartsAt: at('2026-03-02', '12'),
      breakEndsAt: at('2026-03-02', '13'),
      paidBreak: false,
      dayKind: 'workday',
    };
    const ledger = medicalLedger([record], [shift]);
    expect(ledger.segments.reduce((sum, item) => sum + item.units, 0)).toBe(
      3 / 8,
    );
    expect(
      ledger.segments.every(
        (item) => item.end <= shift.breakStartsAt.getTime(),
      ),
    ).toBe(true);
  });
  it('keeps three menstrual days outside the shared sick-pay allowance and pays later excess at zero', () => {
    const sick = Array.from({ length: 30 }, (_, i) =>
      leave(`s${i}`, `2026-01-${String(i + 1).padStart(2, '0')}`),
    );
    const menstrual = ['02', '03', '04', '05'].map((month) =>
      leave(month, `2026-${month}-01`, 'menstrual'),
    );
    const records = [...sick, ...menstrual];
    const ledger = medicalLedger(records, shiftsFor(records));
    expect(
      ledger.segments.find((segment) => segment.requestId === '04')
        ?.paidFraction,
    ).toBe(0.5);
    expect(
      ledger.segments.find((segment) => segment.requestId === '05')
        ?.paidFraction,
    ).toBe(0);
    expect(ledger.years.get(2026)?.shared).toBe(31);
    const cancelled = records.filter((record) => record.id !== 's0');
    expect(
      medicalLedger(cancelled, shiftsFor(cancelled)).segments.find(
        (segment) => segment.requestId === '05',
      )?.paidFraction,
    ).toBe(0.5);
  });
  it('splits a half-paid limit inside a day without rejecting the remainder', () => {
    const records = Array.from({ length: 30 }, (_, i) =>
      leave(`s${i}`, `2026-01-${String(i + 1).padStart(2, '0')}`),
    );
    records[29].endsAt = at('2026-01-30', '13');
    records.push(leave('hospital', '2026-02-01', 'hospitalSick'));
    const ledger = medicalLedger(records, shiftsFor(records));
    expect(
      medicalPaidSeconds(
        ledger.segments,
        'hospital',
        at('2026-02-01').getTime(),
        at('2026-02-01', '17').getTime(),
      ),
    ).toBe(2 * 3600);
  });
  it('resets annual wages across a year boundary while retaining prior-year shared usage', () => {
    const records = [
      leave('a', '2025-12-31', 'hospitalSick'),
      leave('b', '2026-01-01', 'pregnancyRest'),
    ];
    const ledger = medicalLedger(records, shiftsFor(records));
    expect(ledger.years.get(2025)?.shared).toBe(1);
    expect(ledger.years.get(2026)?.shared).toBe(1);
    expect(
      ledger.segments.every((segment) => segment.paidFraction === 0.5),
    ).toBe(true);
  });
  it('counts rest days only after 30 workdays of a continuous medical absence', () => {
    const record: MedicalRecord = {
      id: 'long',
      kind: 'hospitalSick',
      startsAt: at('2026-01-01', '00'),
      endsAt: at('2026-03-01', '00'),
    };
    const shifts = Array.from({ length: 30 }, (_, i) => ({
      startsAt: new Date(
        record.startsAt.getTime() + i * 86400000 + 9 * 3600000,
      ),
      endsAt: new Date(record.startsAt.getTime() + i * 86400000 + 17 * 3600000),
      dayKind: 'workday',
    }));
    const ledger = medicalLedger([record], shifts);
    expect(ledger.years.get(2026)?.shared).toBe(59);
    expect(ledger.segments.filter((segment) => segment.calendar)).toHaveLength(
      29,
    );
    expect(ledger.segments.at(-1)?.paidFraction).toBe(0);
  });
  it('does not prorate a part-time employee twice', () => {
    const record = leave('part', '2026-01-01');
    record.endsAt = at('2026-01-01', '13');
    expect(
      medicalLedger([record], shiftsFor([record]), () => 1200).years.get(2026)
        ?.shared,
    ).toBe(1);
  });
  it('allocates the paid portion to its actual time before an unpaid remainder', () => {
    const records = Array.from({ length: 30 }, (_, i) =>
      leave(`s${i}`, `2026-01-${String(i + 1).padStart(2, '0')}`),
    );
    records[29].endsAt = at('2026-01-30', '13');
    const hospital = leave('hospital', '2026-02-01', 'hospitalSick');
    records.push(hospital);
    const ledger = medicalLedger(records, shiftsFor(records));
    expect(
      medicalPaidSeconds(
        ledger.segments,
        hospital.id,
        at('2026-02-01').getTime(),
        at('2026-02-01', '13').getTime(),
      ),
    ).toBe(7200);
    expect(
      medicalPaidSeconds(
        ledger.segments,
        hospital.id,
        at('2026-02-01', '13').getTime(),
        hospital.endsAt.getTime(),
      ),
    ).toBe(0);
  });
  it('uses the same daily denominator for separate requests and overlapping shift inputs', () => {
    const morning = leave('morning', '2026-01-01', 'menstrual');
    morning.endsAt = at('2026-01-01', '14');
    const evening = {
      ...morning,
      id: 'evening',
      startsAt: at('2026-01-01', '14'),
      endsAt: at('2026-01-01', '19'),
    };
    const shift = {
      startsAt: morning.startsAt,
      endsAt: evening.endsAt,
      dayKind: 'workday',
    };
    const ledger = medicalLedger([morning, evening], [shift, shift]);
    expect(
      ledger.segments.reduce((sum, segment) => sum + segment.units, 0),
    ).toBe(1);
    expect(ledger.years.get(2026)?.menstrualDays.size).toBe(1);
  });
  it('keeps a continuous episode across off-duty hours and excludes partial days from the thirty-day threshold', () => {
    const records = Array.from({ length: 30 }, (_, i) =>
      leave(
        `s${i}`,
        `2026-01-${String(i + 1).padStart(2, '0')}`,
        'hospitalSick',
      ),
    );
    records[29].endsAt = at('2026-01-30', '13');
    records.push({
      ...leave('remainder', '2026-01-30', 'hospitalSick'),
      startsAt: at('2026-01-30', '13'),
    });
    records.push({
      id: 'rest',
      kind: 'hospitalSick',
      startsAt: at('2026-01-31', '00'),
      endsAt: at('2026-02-01', '00'),
    });
    const ledger = medicalLedger(records, shiftsFor(records.slice(0, -1)));
    expect(
      ledger.segments
        .filter((segment) => segment.calendar)
        .map((segment) => segment.requestId),
    ).toEqual(['rest']);
    expect(ledger.years.get(2026)?.shared).toBe(31);
  });
  it('resets continuous counting when an intervening scheduled work interval is not on leave', () => {
    const records = Array.from({ length: 30 }, (_, i) =>
      leave(
        `s${i}`,
        `2026-01-${String(i + 1).padStart(2, '0')}`,
        'hospitalSick',
      ),
    );
    records[29].endsAt = at('2026-01-30', '13');
    const shifts = shiftsFor(records);
    shifts[29].endsAt = at('2026-01-30', '17');
    records.push({
      id: 'rest',
      kind: 'hospitalSick',
      startsAt: at('2026-01-31', '00'),
      endsAt: at('2026-02-01', '00'),
    });
    expect(
      medicalLedger(records, shifts).segments.some(
        (segment) => segment.calendar,
      ),
    ).toBe(false);
  });
  it('resets the half-pay budget during a continuous calendar-counted absence at New Year', () => {
    const start = at('2025-11-01', '00');
    const record: MedicalRecord = {
      id: 'long',
      kind: 'pregnancyRest',
      startsAt: start,
      endsAt: at('2026-02-02', '00'),
    };
    const shifts = Array.from({ length: 30 }, (_, i) => ({
      startsAt: new Date(start.getTime() + i * 86400000 + 9 * 3600000),
      endsAt: new Date(start.getTime() + i * 86400000 + 17 * 3600000),
      dayKind: 'workday',
    }));
    const ledger = medicalLedger([record], shifts);
    expect(ledger.years.get(2025)?.shared).toBe(61);
    expect(ledger.years.get(2026)?.shared).toBe(32);
    expect(
      medicalPaidSeconds(
        ledger.segments,
        record.id,
        at('2026-01-01', '00').getTime(),
        at('2026-01-02', '00').getTime(),
      ),
    ).toBe(43200);
    expect(
      medicalPaidSeconds(
        ledger.segments,
        record.id,
        at('2026-01-31', '00').getTime(),
        record.endsAt.getTime(),
      ),
    ).toBe(0);
  });
  it('does not infer a continuous illness from a month with no schedule or leave records', () => {
    const records = Array.from({ length: 30 }, (_, i) =>
      leave(
        `s${i}`,
        `2026-01-${String(i + 1).padStart(2, '0')}`,
        'hospitalSick',
      ),
    );
    const shifts = shiftsFor(records);
    records.push({
      id: 'later',
      kind: 'hospitalSick',
      startsAt: at('2026-03-01', '00'),
      endsAt: at('2026-03-02', '00'),
    });
    expect(
      medicalLedger(records, shifts).segments.some(
        (segment) => segment.calendar,
      ),
    ).toBe(false);
  });
});
