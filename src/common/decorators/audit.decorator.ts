import { SetMetadata } from '@nestjs/common';

import type { AuditAction, AuditResource } from 'src/db/schema/audit';

export const AUDIT_KEY = 'audit';

export type AuditIdSource =
  | { param: string }
  | { body: string }
  | { response: true }
  | { column: string; param: string }
  | { column: string; body: string }
  | { column: string; response: true }
  | { column: string; organization: true };

export type AuditSubTable =
  | 'offer'
  | 'recipeIngredient'
  | 'refund'
  | 'waitlistSetting';

export type AuditVia = { table: AuditSubTable; ownerColumn: string };

export type AuditTarget = {
  resource: AuditResource;
  idSource: AuditIdSource | AuditIdSource[];
  via?: AuditVia;
  action?: AuditAction;
};

export type AuditMetadata = AuditTarget[];

type AuditArgs = [AuditResource, AuditIdSource] | AuditTarget[];

const isSingleTarget = (
  args: AuditArgs,
): args is [AuditResource, AuditIdSource] => typeof args[0] === 'string';

export function Audit(
  resource: AuditResource,
  idSource: AuditIdSource,
): MethodDecorator;
export function Audit(...targets: AuditTarget[]): MethodDecorator;
export function Audit(...args: AuditArgs): MethodDecorator {
  const targets: AuditMetadata = isSingleTarget(args)
    ? [{ resource: args[0], idSource: args[1] }]
    : args;

  return SetMetadata(AUDIT_KEY, targets);
}
