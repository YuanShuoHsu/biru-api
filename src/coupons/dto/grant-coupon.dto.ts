import { ApiProperty } from '@nestjs/swagger';

import { IsEmail } from 'class-validator';

export class GrantCouponDto {
  @ApiProperty({ description: '發放對象的會員 email' })
  @IsEmail()
  email: string;
}
