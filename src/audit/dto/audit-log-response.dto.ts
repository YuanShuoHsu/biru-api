import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  ATTENDANCE_AUDIT_RESOURCES,
  ATTENDANCE_AUDIT_VERBS,
} from '../../attendance/attendance-audit.js';
import {
  auditActionEnum,
  auditResourceEnum,
  type AuditChangeLabels,
  type AuditResourceLabel,
} from '../../db/schema/audit.js';

export const AUDIT_LOG_RESOURCES = [
  ...auditResourceEnum.enumValues,
  ...ATTENDANCE_AUDIT_RESOURCES,
];
export type AuditLogResource = (typeof AUDIT_LOG_RESOURCES)[number];

export const AUDIT_LOG_ACTIONS = [
  ...new Set([...auditActionEnum.enumValues, ...ATTENDANCE_AUDIT_VERBS]),
];
export type AuditLogAction = (typeof AUDIT_LOG_ACTIONS)[number];

export type AuditLogChanges = Record<
  string,
  { before?: unknown; after?: unknown }
>;

export class AuditLogResponseDto {
  @ApiProperty() id: string;

  @ApiPropertyOptional({
    description: '操作者帳號被刪除後為 null，actorName / actorEmail 仍保留',
    nullable: true,
  })
  actorId?: string | null;

  @ApiPropertyOptional({
    description: '出勤與薪資紀錄取自目前帳號，帳號刪除後為 null',
    nullable: true,
  })
  actorName?: string | null;

  @ApiPropertyOptional({ nullable: true }) actorEmail?: string | null;

  @ApiPropertyOptional({
    description: '異動所屬店家；平台層異動（優惠券定義、輪播圖）為 null',
    nullable: true,
  })
  organizationId?: string | null;

  @ApiProperty({ enum: AUDIT_LOG_RESOURCES, enumName: 'AuditResource' })
  resource: AuditLogResource;

  @ApiProperty() resourceId: string;

  @ApiPropertyOptional({
    description:
      '寫入當下的名稱快照；多語名稱為 locale → 名稱的物件，訂單編號等單語識別為字串',
    nullable: true,
    oneOf: [
      { type: 'string' },
      { additionalProperties: { type: 'string' }, type: 'object' },
    ],
  })
  resourceLabel?: AuditResourceLabel | null;

  @ApiPropertyOptional({
    description: '由根到父的 id，供前端拼出巢狀路由；頂層資源為空陣列',
    isArray: true,
    nullable: true,
    type: String,
  })
  ancestorIds?: string[] | null;

  @ApiProperty({ enum: AUDIT_LOG_ACTIONS, enumName: 'AuditAction' })
  action: AuditLogAction;

  @ApiProperty({
    additionalProperties: {
      properties: { after: {}, before: {} },
      type: 'object',
    },
    description:
      '欄位名 → 變更前後值；建立的 before 與刪除的 after 為 null。出勤與薪資紀錄只記當下的值時省略另一側',
    type: 'object',
  })
  changes: AuditLogChanges;

  @ApiPropertyOptional({
    additionalProperties: {
      additionalProperties: {
        oneOf: [
          { type: 'string' },
          { additionalProperties: { type: 'string' }, type: 'object' },
        ],
      },
      type: 'object',
    },
    description: '外鍵欄位名 → id → 寫入當下的名稱快照；沒有外鍵異動時為 null',
    nullable: true,
    type: 'object',
  })
  changeLabels?: AuditChangeLabels | null;

  @ApiProperty() createdAt: Date;
}
