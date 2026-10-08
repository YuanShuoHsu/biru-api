import type { AuditChanges } from 'src/db/schema/audit';

export type AuditRow = Record<string, unknown>;

const IGNORED_COLUMNS = new Set([
  'id',
  'idempotencyKey',
  'organizationId',
  'createdAt',
  'updatedAt',
]);

export const diffAuditRows = (
  before: AuditRow | undefined,
  after: AuditRow | undefined,
): AuditChanges => {
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  const changes: AuditChanges = {};

  for (const key of keys) {
    if (IGNORED_COLUMNS.has(key)) continue;

    const previous = before?.[key] ?? null;
    const next = after?.[key] ?? null;
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;

    changes[key] = { before: previous, after: next };
  }

  return changes;
};
