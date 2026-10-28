import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { AuditService } from './audit.service.js';

const createdAt = '2026-10-28 08:00:00';

const auditRow = {
  source: 'audit',
  id: 'audit-1',
  actorId: 'user-1',
  actorName: 'Owner',
  actorEmail: 'owner@example.com',
  organizationId: 'org-1',
  resource: 'order',
  resourceId: 'order-1',
  resourceLabel: 'A001',
  ancestorIds: [],
  action: 'update',
  changes: { status: { before: 'pending', after: 'ready' } },
  changeLabels: null,
  createdAt,
  targetEmployeeName: null,
};

const attendanceRow = {
  source: 'attendance',
  id: 'attendance-1',
  actorId: 'user-1',
  actorName: 'Owner',
  actorEmail: 'owner@example.com',
  organizationId: 'org-1',
  resource: 'shift',
  resourceId: 'shift-1',
  resourceLabel: null,
  ancestorIds: null,
  action: 'create',
  changes: { employeeId: 'employee-1', teamId: 'team-1', note: 'x' },
  changeLabels: null,
  createdAt,
  targetEmployeeName: 'Barista',
};

describe('AuditService.listAll', () => {
  it('labels the foreign keys of attendance entries only', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [auditRow, attendanceRow] })
      .mockResolvedValueOnce({ rows: [{ total: 2 }] })
      .mockResolvedValueOnce({
        rows: [
          { field: 'employeeId', id: 'employee-1', label: 'Barista' },
          { field: 'teamId', id: 'team-1', label: 'Bar' },
        ],
      });
    const service = new AuditService({ execute } as unknown as DrizzleDB);

    const { data, total } = await service.listAll();

    expect(total).toBe(2);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(data).toEqual([
      {
        id: 'audit-1',
        actorId: 'user-1',
        actorName: 'Owner',
        actorEmail: 'owner@example.com',
        organizationId: 'org-1',
        resource: 'order',
        resourceId: 'order-1',
        resourceLabel: 'A001',
        ancestorIds: [],
        action: 'update',
        changes: { status: { before: 'pending', after: 'ready' } },
        changeLabels: null,
        createdAt: new Date(createdAt),
      },
      {
        id: 'attendance-1',
        actorId: 'user-1',
        actorName: 'Owner',
        actorEmail: 'owner@example.com',
        organizationId: 'org-1',
        resource: 'shift',
        resourceId: 'shift-1',
        resourceLabel: 'Barista',
        ancestorIds: null,
        action: 'create',
        changes: {
          employeeId: { after: 'employee-1' },
          teamId: { after: 'team-1' },
          note: { after: 'x' },
        },
        changeLabels: {
          employeeId: { 'employee-1': 'Barista' },
          teamId: { 'team-1': 'Bar' },
        },
        createdAt: new Date(createdAt),
      },
    ]);
  });

  it('gives an attendance entry without foreign keys empty labels', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [auditRow, { ...attendanceRow, changes: { note: 'x' } }],
      })
      .mockResolvedValueOnce({ rows: [{ total: 2 }] });
    const service = new AuditService({ execute } as unknown as DrizzleDB);

    const { data } = await service.listAll();

    expect(execute).toHaveBeenCalledTimes(2);
    expect(data.map(({ changeLabels }) => changeLabels)).toEqual([null, {}]);
    expect(Object.keys(data[1])).toEqual([
      'id',
      'actorId',
      'actorName',
      'actorEmail',
      'organizationId',
      'resource',
      'resourceId',
      'resourceLabel',
      'ancestorIds',
      'action',
      'changes',
      'changeLabels',
      'createdAt',
    ]);
  });

  it('skips the label query when no entry has a foreign key', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ rows: [auditRow] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });
    const service = new AuditService({ execute } as unknown as DrizzleDB);

    const { data } = await service.listAll();

    expect(execute).toHaveBeenCalledTimes(2);
    expect(data[0]).toMatchObject({ id: 'audit-1', changeLabels: null });
  });
});
