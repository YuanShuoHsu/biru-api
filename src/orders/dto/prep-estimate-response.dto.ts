import { ApiProperty } from '@nestjs/swagger';

export class PrepEstimateResponseDto {
  @ApiProperty({ enum: ['observed', 'leadTime'] })
  basis: 'observed' | 'leadTime';
  @ApiProperty({ description: '無條件進位到 5 分鐘' })
  estimatedMinutes: number;
  @ApiProperty({ description: '計入估算的製作中訂單數' })
  queuedOrders: number;
}
