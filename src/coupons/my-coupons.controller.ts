import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { CouponsService } from './coupons.service';
import { MyCouponResponseDto } from './dto/coupon-response.dto';

@ApiTags('coupons')
@Controller('users/me/coupons')
export class MyCouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get()
  @ApiOperation({ summary: '我的優惠券（跨店錢包）' })
  getAllMine(@Session() session: UserSession): Promise<MyCouponResponseDto[]> {
    return this.couponsService.getAllMine(session.user.id);
  }
}
