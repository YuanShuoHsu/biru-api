import { ApiProperty } from '@nestjs/swagger';

export class OrderModeTokenResponseDto {
  @ApiProperty({
    description:
      '印在櫃台／得來速 QR code 的簽章；不會過期，更換門市 QR secret 後失效',
  })
  token: string;
}
