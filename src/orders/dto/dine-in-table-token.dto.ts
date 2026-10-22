import { ApiProperty } from '@nestjs/swagger';

export class DineInTableTokenResponseDto {
  @ApiProperty({
    description: '印在桌上 QR code 的簽章；不會過期，更換門市 QR secret 後失效',
  })
  token: string;
}
