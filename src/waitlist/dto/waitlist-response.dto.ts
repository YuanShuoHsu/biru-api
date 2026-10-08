import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';

import {
  waitlistTicketStatusEnum,
  type WaitlistTicketStatus,
} from 'src/db/schema/waitlist';

import { waitlistErrorCodes, type WaitlistErrorCode } from '../waitlist-errors';
import { WaitlistGroupDto } from './waitlist-group.dto';

export class WaitlistGroupStatusDto extends WaitlistGroupDto {
  @ApiPropertyOptional({
    description:
      '最近一次叫號的號碼（之後入座、過號或取消仍保留），尚未叫號為 null',
    example: 'A008',
  })
  currentTicketNumber: string | null;
  @ApiProperty() waitingCount: number;
}

export class WaitlistStatusResponseDto {
  @ApiProperty({ description: '營業中但已過打烊前停止取號時間' })
  cutoff: boolean;
  @ApiProperty() enabled: boolean;
  @ApiProperty({ type: [WaitlistGroupStatusDto] })
  groups: WaitlistGroupStatusDto[];
  @ApiProperty({ description: '是否在營業時間內' }) open: boolean;
  @ApiProperty() paused: boolean;
}

export class WaitlistTicketResponseDto {
  @ApiProperty({ description: '前方候位組數，非候位中為 0' })
  aheadCount: number;
  @ApiPropertyOptional() calledAt: Date | null;
  @ApiPropertyOptional({ description: '顧客回覆確認前往的時間' })
  confirmedAt: Date | null;
  @ApiProperty() createdAt: Date;
  @ApiPropertyOptional() endedAt: Date | null;
  @ApiPropertyOptional({ description: '叫號後的保留期限，非叫號中為 null' })
  holdUntil: Date | null;
  @ApiProperty() id: string;
  @ApiProperty() partySize: number;
  @ApiProperty() prefix: string;
  @ApiProperty({
    enum: waitlistTicketStatusEnum.enumValues,
    enumName: 'WaitlistTicketStatus',
  })
  status: WaitlistTicketStatus;
  @ApiProperty({ example: 'A012' }) ticketNumber: string;
}

export class WaitlistTicketDetailResponseDto extends WaitlistTicketResponseDto {
  @ApiPropertyOptional({
    description:
      '同組最近一次叫號的號碼，與候位狀態的 currentTicketNumber 相同',
    example: 'B003',
  })
  currentTicketNumber: string | null;
}

export class AdminWaitlistTicketDto extends WaitlistTicketResponseDto {
  @ApiProperty({
    description: '店員可將此號碼牌轉換到的狀態',
    enum: waitlistTicketStatusEnum.enumValues,
    enumName: 'WaitlistTicketStatus',
    isArray: true,
  })
  availableTransitions: WaitlistTicketStatus[];
  @ApiPropertyOptional() email: string | null;
  @ApiProperty({ description: '已叫號且超過保留期限' }) overdue: boolean;
  @ApiProperty() name: string;
  @ApiProperty() phoneNumber: string;
}

export class WaitlistTicketListItemDto extends OmitType(
  AdminWaitlistTicketDto,
  ['aheadCount', 'availableTransitions', 'holdUntil', 'overdue'] as const,
) {}

export class AdminWaitlistResponseDto {
  @ApiProperty({ description: '營業中但已過打烊前停止取號時間' })
  cutoff: boolean;
  @ApiProperty() cutoffMinutes: number;
  @ApiProperty() enabled: boolean;
  @ApiProperty({ type: [WaitlistGroupDto] }) groups: WaitlistGroupDto[];
  @ApiProperty() graceMinutes: number;
  @ApiProperty() holdMinutes: number;
  @ApiProperty({ description: '是否在營業時間內' }) open: boolean;
  @ApiProperty() paused: boolean;
  @ApiProperty({
    type: [AdminWaitlistTicketDto],
    description: '進行中的號碼牌與今日已結束的號碼牌',
  })
  tickets: AdminWaitlistTicketDto[];
}

export class WaitlistErrorResponseDto {
  @ApiProperty({ enum: waitlistErrorCodes, enumName: 'WaitlistErrorCode' })
  message: WaitlistErrorCode;
  @ApiProperty({ example: 'Conflict' }) error: string;
  @ApiProperty() statusCode: number;
  @ApiProperty() path: string;
  @ApiProperty() success: boolean;
  @ApiProperty() timestamp: string;
}
