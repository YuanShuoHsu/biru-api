import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AllowAnonymous,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';

import { CouponsService } from './coupons.service';
import {
  AvailableCouponDto,
  ClaimableCouponDto,
  UserCouponResponseDto,
} from './dto/coupon-response.dto';
import {
  ValidateCouponDto,
  ValidateCouponResponseDto,
} from './dto/validate-coupon.dto';

@ApiTags('coupons')
@Controller('organizations/:organizationSlug/coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post('validate')
  @AllowAnonymous()
  @ApiOperation({ summary: '驗證優惠碼' })
  validate(
    @Param('organizationSlug') organizationSlug: string,
    @Body() dto: ValidateCouponDto,
    @Session() session: UserSession | null,
  ): Promise<ValidateCouponResponseDto> {
    return this.couponsService.validate(
      organizationSlug,
      dto,
      session?.user.id || null,
    );
  }

  @Get('available')
  @AllowAnonymous()
  @ApiOperation({ summary: '結帳頁可用券（公開券＋錢包未用券）' })
  getAvailable(
    @Param('organizationSlug') organizationSlug: string,
    @Session() session: UserSession | null,
  ): Promise<AvailableCouponDto[]> {
    return this.couponsService.getAvailable(
      organizationSlug,
      session?.user.id || null,
    );
  }

  @Get('claimable')
  @AllowAnonymous()
  @ApiOperation({ summary: '店家頁可領券' })
  getClaimable(
    @Param('organizationSlug') organizationSlug: string,
    @Session() session: UserSession | null,
  ): Promise<ClaimableCouponDto[]> {
    return this.couponsService.getClaimable(
      organizationSlug,
      session?.user.id || null,
    );
  }

  @Get('mine')
  @ApiOperation({ summary: '我的優惠券（錢包）' })
  getMine(
    @Param('organizationSlug') organizationSlug: string,
    @Session() session: UserSession,
  ): Promise<UserCouponResponseDto[]> {
    return this.couponsService.getMine(organizationSlug, session.user.id);
  }
}
