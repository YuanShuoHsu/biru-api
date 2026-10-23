import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import {
  cashDrawerMovementTypeEnum,
  cashDrawerSessionStatusEnum,
  type CashDrawerMovementType,
  type CashDrawerSessionStatus,
} from '../../db/schema/cash-drawer.js';

const AMOUNT = /^\d{1,8}(\.\d{1,2})?$/;

export class OpenCashDrawerDto {
  @ApiPropertyOptional({
    example: '3000.00',
    description: '省略時沿用上一次結帳的留存零用金',
  })
  @IsOptional()
  @Matches(AMOUNT)
  openingFloat?: string;
}

export class CreateCashDrawerMovementDto {
  @ApiProperty({
    enum: cashDrawerMovementTypeEnum.enumValues,
    enumName: 'CashDrawerMovementType',
  })
  @IsEnum(cashDrawerMovementTypeEnum.enumValues)
  type: CashDrawerMovementType;

  @ApiProperty({ example: '500.00' })
  @Matches(/^(?!0+(\.0+)?$)\d{1,8}(\.\d{1,2})?$/)
  amount: string;

  @ApiProperty()
  @IsString()
  @Matches(/\S/)
  @MaxLength(200)
  reason: string;
}

export class CloseCashDrawerDto {
  @ApiProperty({ example: '12850.00', description: '實點現金' })
  @Matches(AMOUNT)
  countedCash: string;

  @ApiProperty({
    example: '3000.00',
    description: '留在錢櫃給下一次開帳的零用金，不可超過實點現金',
  })
  @Matches(AMOUNT)
  retainedFloat: string;

  @ApiPropertyOptional({ description: '差額超過門市設定的門檻時必填' })
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(500)
  varianceNote?: string;
}

export class CashDrawerMovementDto {
  @ApiProperty() id: string;
  @ApiProperty({
    enum: cashDrawerMovementTypeEnum.enumValues,
    enumName: 'CashDrawerMovementType',
  })
  type: CashDrawerMovementType;
  @ApiProperty() amount: string;
  @ApiProperty() reason: string;
  @ApiProperty() createdBy: string;
  @ApiProperty() createdAt: Date;
}

export class CashDrawerSummaryDto {
  @ApiProperty({ description: '期間內現金訂單實收' }) cashSales: string;
  @ApiProperty({ description: '期間內現金訂單的退款' })
  cashRefunds: string;
  @ApiProperty() payIns: string;
  @ApiProperty() payOuts: string;
  @ApiProperty({ description: '零用金＋實收−退款＋存入−提出' })
  expectedCash: string;
}

export class CashDrawerSessionDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: '2026-10-23' }) businessDate: string;
  @ApiProperty({
    enum: cashDrawerSessionStatusEnum.enumValues,
    enumName: 'CashDrawerSessionStatus',
  })
  status: CashDrawerSessionStatus;
  @ApiProperty() openedAt: Date;
  @ApiProperty() openedBy: string;
  @ApiProperty() openingFloat: string;
  @ApiProperty({ nullable: true }) closedAt: Date | null;
  @ApiProperty({ nullable: true }) closedBy: string | null;
  @ApiProperty({ nullable: true }) countedCash: string | null;
  @ApiProperty({ nullable: true }) expectedCash: string | null;
  @ApiProperty({ nullable: true }) retainedFloat: string | null;
  @ApiProperty({ nullable: true }) varianceNote: string | null;
  @ApiProperty({ type: [CashDrawerMovementDto] })
  movements: CashDrawerMovementDto[];
  @ApiProperty({ type: CashDrawerSummaryDto }) summary: CashDrawerSummaryDto;
}

export class CurrentCashDrawerDto {
  @ApiProperty({ type: CashDrawerSessionDto, nullable: true })
  session: CashDrawerSessionDto | null;
  @ApiProperty({ description: '下一次開帳預設沿用的零用金' })
  suggestedOpeningFloat: string;
  @ApiProperty({ description: '差額在此金額內可不填說明' })
  varianceTolerance: string;
}
