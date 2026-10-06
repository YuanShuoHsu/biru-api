import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  waitlistTicketStatusEnum,
  type WaitlistTicketStatus,
} from 'src/db/schema/waitlist';

import { waitlistErrorCodes, type WaitlistErrorCode } from '../waitlist-errors';
import { WaitlistGroupDto } from './waitlist-group.dto';

export class WaitlistGroupStatusDto extends WaitlistGroupDto {
  @ApiProperty({ type: [String], description: '叫號中的號碼，最近叫的在前' })
  calledTicketNumbers: string[];
  @ApiProperty() waitingCount: number;
}

export class WaitlistStatusResponseDto {
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

export class AdminWaitlistTicketDto extends WaitlistTicketResponseDto {
  @ApiPropertyOptional() email: string | null;
  @ApiProperty() name: string;
  @ApiProperty() phoneNumber: string;
}

export class AdminWaitlistResponseDto {
  @ApiProperty() enabled: boolean;
  @ApiProperty({ type: [WaitlistGroupDto] }) groups: WaitlistGroupDto[];
  @ApiProperty() holdMinutes: number;
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
