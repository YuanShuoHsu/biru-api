import { ApiProperty } from '@nestjs/swagger';

export class DineInTableTokenResponseDto {
  @ApiProperty({
    description:
      '印在桌上 QR code 的簽章；不會過期，換 BETTER_AUTH_SECRET 會讓已印的全部失效',
  })
  token: string;
}
