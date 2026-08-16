import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  auditActionEnum,
  auditResourceEnum,
  type AuditAction,
  type AuditChanges,
  type AuditResource,
  type AuditResourceLabel,
} from 'src/db/schema/audit';

export class AuditLogResponseDto {
  @ApiProperty() id: string;

  @ApiPropertyOptional({
    description: '操作者帳號被刪除後為 null，actorName / actorEmail 仍保留',
    nullable: true,
  })
  actorId?: string | null;

  @ApiProperty() actorName: string;
  @ApiProperty() actorEmail: string;

  @ApiPropertyOptional({
    description: '異動所屬店家；平台層異動（優惠券定義、輪播圖）為 null',
    nullable: true,
  })
  organizationId?: string | null;

  @ApiProperty({
    enum: auditResourceEnum.enumValues,
    enumName: 'AuditResource',
  })
  resource: AuditResource;

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

  @ApiProperty({ enum: auditActionEnum.enumValues, enumName: 'AuditAction' })
  action: AuditAction;

  @ApiProperty({
    additionalProperties: {
      properties: { after: {}, before: {} },
      type: 'object',
    },
    description: '欄位名 → 變更前後值；建立的 before 與刪除的 after 為 null',
    type: 'object',
  })
  changes: AuditChanges;

  @ApiProperty() createdAt: Date;
}
