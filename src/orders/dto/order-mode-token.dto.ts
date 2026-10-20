import { ApiProperty } from '@nestjs/swagger';

export class OrderModeTokenResponseDto {
  @ApiProperty({
    description:
      '印在櫃台／得來速 QR code 的簽章；不會過期，換 BETTER_AUTH_SECRET 會讓已印的全部失效',
  })
  token: string;
}
