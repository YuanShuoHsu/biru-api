import type { AuditTarget } from '../common/decorators/audit.decorator.js';

export const PRINTER_AUDIT: AuditTarget = {
  resource: 'organization',
  idSource: { column: 'organizationId', organization: true },
  via: { table: 'printer', ownerColumn: 'organizationId' },
};
