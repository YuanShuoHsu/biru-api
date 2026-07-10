import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AllowAnonymous,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';

import { Roles } from 'src/menus/decorators/roles.decorator';

import { CouponsService } from './coupons.service';
import {
  AvailableCouponDto,
  ClaimableCouponDto,
  CouponResponseDto,
  UserCouponResponseDto,
} from './dto/coupon-response.dto';
import { CreateCouponDto, UpdateCouponDto } from './dto/create-coupon.dto';
import { GrantCouponDto } from './dto/grant-coupon.dto';
import {
  ValidateCouponDto,
  ValidateCouponResponseDto,
} from './dto/validate-coupon.dto';

@ApiTags('coupons')
@Controller('organizations/:organizationSlug/coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post()
  @Roles({ coupon: ['create'] }, 'organizationSlug')
  @ApiOperation({ summary: '建立優惠券' })
  create(
    @Param('organizationSlug') organizationSlug: string,
    @Body() dto: CreateCouponDto,
  ): Promise<CouponResponseDto> {
    return this.couponsService.create(organizationSlug, dto);
  }

  @Get()
  @Roles({ coupon: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '查詢優惠券列表' })
  findAll(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<CouponResponseDto[]> {
    return this.couponsService.findAll(organizationSlug);
  }

  @Patch(':couponId')
  @Roles({ coupon: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '更新優惠券' })
  update(
    @Param('organizationSlug') organizationSlug: string,
    @Param('couponId') couponId: string,
    @Body() dto: UpdateCouponDto,
  ): Promise<CouponResponseDto> {
    return this.couponsService.update(organizationSlug, couponId, dto);
  }

  @Delete(':couponId')
  @Roles({ coupon: ['delete'] }, 'organizationSlug')
  @ApiOperation({ summary: '刪除優惠券' })
  remove(
    @Param('organizationSlug') organizationSlug: string,
    @Param('couponId') couponId: string,
  ): Promise<void> {
    return this.couponsService.remove(organizationSlug, couponId);
  }

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

  @Post(':couponId/claim')
  @ApiOperation({ summary: '領取優惠券' })
  claim(
    @Param('organizationSlug') organizationSlug: string,
    @Param('couponId') couponId: string,
    @Session() session: UserSession,
  ): Promise<UserCouponResponseDto> {
    return this.couponsService.claim(
      organizationSlug,
      couponId,
      session.user.id,
    );
  }

  @Post(':couponId/grant')
  @Roles({ coupon: ['update'] }, 'organizationSlug')
  @ApiOperation({ summary: '發放優惠券給指定會員' })
  grant(
    @Param('organizationSlug') organizationSlug: string,
    @Param('couponId') couponId: string,
    @Body() dto: GrantCouponDto,
  ): Promise<UserCouponResponseDto> {
    return this.couponsService.grant(organizationSlug, couponId, dto.email);
  }
}
