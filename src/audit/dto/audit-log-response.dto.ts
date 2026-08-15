import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  auditActionEnum,
  auditResourceEnum,
  type AuditAction,
  type AuditChanges,
  type AuditResource,
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

  @ApiProperty({
    enum: auditResourceEnum.enumValues,
    enumName: 'AuditResource',
  })
  resource: AuditResource;

  @ApiProperty() resourceId: string;

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
