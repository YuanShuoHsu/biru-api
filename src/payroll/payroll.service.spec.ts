import type { DrizzleDB } from 'src/drizzle/drizzle.module';

import type { PayrollRulesService } from './payroll-rules.service';
import { PayrollService } from './payroll.service';
import { taiwan2026 } from './taiwan-rules.fixture';

const actor = { organizationId: 'org', userId: 'owner', role: 'owner' };
const employee = {
  id: 'employee',
  organizationId: 'org',
  userId: 'staff',
  name: 'Staff',
  legalStatus: 'national',
  birthDate: '1990-01-01',
  pregnancyPeriods: [],
  nursingPeriods: [],
  indigenousHolidays: [],
};

const row = {
  id: 'statement',
  employeeId: 'employee',
  month: '2026-02',
  status: 'draft',
  createdBy: 'drafter',
  snapshot: {
    sourceFingerprint: 'original',
    blockers: [],
    ruleVersion: 'TW-general-2026-2',
  },
};

function setup(results: unknown[][], current = row.snapshot) {
  const select = jest.fn(() => {
    const promise = Promise.resolve(results.shift() ?? []);
    const query: Record<string, unknown> = { then: promise.then.bind(promise) };
    for (const method of [
      'from',
      'innerJoin',
      'leftJoin',
      'where',
      'orderBy',
      'limit',
    ])
      query[method] = () => query;
    return query;
  });
  const update = jest.fn(() => ({
    set: () => ({
      where: () => ({
        returning: () => Promise.resolve([{ ...row, status: 'reviewed' }]),
      }),
    }),
  }));
  const db = {
    select,
    update,
    execute: jest.fn(),
    insert: jest.fn(() => ({ values: jest.fn() })),
    transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(db),
  };
  const service = new PayrollService(
    db as unknown as DrizzleDB,
    {} as PayrollRulesService,
  );
  const snapshot = jest.fn(() => Promise.resolve(current));
  Object.defineProperty(service, 'snapshot', { value: snapshot });
  return { service, update, snapshot };
}

describe('Payroll review and publication', () => {
  it('does not publish a draft without review', async () => {
    const { service, update } = setup([[row], [employee]]);
    await expect(
      service.transition(actor, row.id, 'published', 'review'),
    ).rejects.toThrow('invalidPayrollState');
    expect(update).not.toHaveBeenCalled();
  });
  it('rejects changed source data after a draft was created', async () => {
    const { service, update } = setup([[row], [employee]], {
      ...row.snapshot,
      sourceFingerprint: 'changed',
    });
    await expect(
      service.transition(actor, row.id, 'reviewed', 'review'),
    ).rejects.toThrow('payrollSourceChanged');
    expect(update).not.toHaveBeenCalled();
  });
  it('rejects a draft calculated under an older rule version', async () => {
    const { service, update } = setup([
      [
        {
          ...row,
          snapshot: { ...row.snapshot, ruleVersion: 'TW-general-2026-1' },
        },
      ],
      [employee],
    ]);
    await expect(
      service.transition(actor, row.id, 'reviewed', 'review'),
    ).rejects.toThrow('payrollSourceChanged');
    expect(update).not.toHaveBeenCalled();
  });
  it('does not write a duplicate publication on retry', async () => {
    const published = { ...row, status: 'published' };
    const { service, update, snapshot } = setup([[published]]);
    await expect(
      service.transition(actor, row.id, 'published', 'review'),
    ).resolves.toEqual(published);
    expect(update).not.toHaveBeenCalled();
    expect(snapshot).not.toHaveBeenCalled();
  });
  it('refuses to review the reviewer own payslip', async () => {
    const { service, update } = setup([
      [row],
      [{ ...employee, userId: 'owner' }],
    ]);
    await expect(
      service.transition(actor, row.id, 'reviewed', 'review'),
    ).rejects.toThrow('cannotReviewSelf');
    expect(update).not.toHaveBeenCalled();
  });
  it('refuses to publish the publisher own payslip', async () => {
    const reviewed = { ...row, status: 'reviewed' };
    const { service, update } = setup([
      [reviewed],
      [{ ...employee, userId: 'owner' }],
    ]);
    await expect(
      service.transition(actor, row.id, 'published', 'review'),
    ).rejects.toThrow('cannotReviewSelf');
    expect(update).not.toHaveBeenCalled();
  });
  it('refuses to review a draft the reviewer created', async () => {
    const { service, update } = setup([
      [{ ...row, createdBy: 'owner' }],
      [employee],
    ]);
    await expect(
      service.transition(actor, row.id, 'reviewed', 'review'),
    ).rejects.toThrow('cannotReviewOwnDraft');
    expect(update).not.toHaveBeenCalled();
  });
  it('lets the drafter publish a payslip someone else reviewed', async () => {
    const reviewed = { ...row, status: 'reviewed', createdBy: 'owner' };
    const { service, update } = setup([[reviewed], [employee]]);
    await expect(
      service.transition(actor, row.id, 'published', 'review'),
    ).resolves.toHaveProperty('status', 'reviewed');
    expect(update).toHaveBeenCalledTimes(1);
  });
  it('reviews a current draft with no blockers', async () => {
    const { service, update } = setup([[row], [employee]]);
    await expect(
      service.transition(actor, row.id, 'reviewed', 'review'),
    ).resolves.toHaveProperty('status', 'reviewed');
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('Payroll terms validation', () => {
  const insurance = {
    voluntaryHealthInsurance: false,
    healthDependents: 0,
    voluntaryPercent: 0,
    employerPercent: 6,
    taxMethod: 'resident5' as const,
    withholdingDependents: 0,
  };
  const dto = {
    employeeId: 'employee',
    effectiveFrom: '2026-03-01',
    salaryType: 'hourly' as const,
    salaryCents: '20000',
    allowanceCents: '0',
    otherDeductionCents: '0',
  };
  it('does not change terms a published payslip was calculated from', async () => {
    const { service } = setup([
      [employee],
      [],
      [],
      [{ hiredAt: new Date('2020-01-01T00:00:00+08:00'), terminatedAt: null }],
      [],
      [{ effectiveFrom: new Date('2026-06-01T00:00:00+08:00') }],
      [{ id: 'statement' }],
    ]);
    Object.defineProperty(service, 'ruleSets', {
      value: {
        resolve: () => Promise.resolve({ rules: taiwan2026, unconfirmed: [] }),
      },
    });
    const insert = jest.spyOn(
      Reflect.get(service, 'db') as { insert: () => unknown },
      'insert',
    );
    await expect(
      service.saveTerms(actor, { ...dto, insurance }),
    ).rejects.toThrow('payrollLocked');
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('Drafting a payslip', () => {
  it('does not recalculate a month that was already published', async () => {
    const { service, snapshot } = setup([[], [employee], [{ id: row.id }]]);
    await expect(
      service.draft(actor, {
        idempotencyKey: 'key',
        employeeId: 'employee',
        month: '2026-02',
        reason: 'redo',
      }),
    ).rejects.toThrow('payrollLocked');
    expect(snapshot).not.toHaveBeenCalled();
  });
});
