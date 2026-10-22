import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { qrOrderModes, type QrOrderMode } from '../order-qr-token.js';

export class OrderQrQueryDto {
  @ApiProperty({ enum: qrOrderModes, enumName: 'QrOrderMode' })
  @IsEnum(qrOrderModes)
  mode: QrOrderMode;

  @ApiPropertyOptional({ description: '內用必填' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  tableNumber?: number;

  @ApiPropertyOptional({ description: '桌上 QR code 的桌號簽章' })
  @IsOptional()
  @IsString()
  tableToken?: string;

  @ApiPropertyOptional({ description: '櫃台／得來速 QR code 的點餐方式簽章' })
  @IsOptional()
  @IsString()
  modeToken?: string;
}

export class OrderQrSessionResponseDto {
  @ApiProperty({ enum: qrOrderModes, enumName: 'QrOrderMode' })
  mode: QrOrderMode;

  @ApiProperty({ nullable: true, type: Number })
  tableNumber: number | null;

  @ApiProperty()
  expiresAt: Date;
}

export class OrderQrSecretResponseDto {
  @ApiProperty({
    description: '從未更換過為 null，表示仍沿用最初的 QR code',
    nullable: true,
    type: Date,
  })
  rotatedAt: Date | null;

  @ApiProperty({
    description: '能否換回上一把，讓更換前印出的 QR code 恢復有效',
  })
  restorable: boolean;
}
