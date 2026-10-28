import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IsOptional, IsString } from 'class-validator';

export class WaitlistQrQueryDto {
  @ApiPropertyOptional({ description: '門市現場候位 QR code 的簽章' })
  @IsOptional()
  @IsString()
  token?: string;
}

export class WaitlistQrSessionResponseDto {
  @ApiProperty()
  expiresAt: Date;
}

export class WaitlistQrTokenResponseDto {
  @ApiProperty({
    description:
      '印在門市現場候位 QR code 的簽章；不會過期，更換門市 QR secret 後失效',
  })
  token: string;
}
