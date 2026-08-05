import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from 'src/menus/decorators/roles.decorator';

import { CouponsService } from './coupons.service';
import { CouponPaginationQueryDto } from './dto/coupon-pagination-query.dto';
import {
  CouponResponseDto,
  UserCouponResponseDto,
} from './dto/coupon-response.dto';
import { GrantCouponDto } from './dto/grant-coupon.dto';

@ApiTags('coupons')
@Controller('organizations/:organizationSlug/coupons')
export class OrganizationCouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get()
  @Roles({ coupon: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '查詢本店適用的優惠券列表' })
  findAll(
    @Param('organizationSlug') organizationSlug: string,
    @Query() query: CouponPaginationQueryDto,
  ): Promise<{ data: CouponResponseDto[]; total: number }> {
    return this.couponsService.findAllForOrganization(organizationSlug, query);
  }

  @Post(':couponId/grant')
  @Roles({ coupon: ['create'] }, 'organizationSlug')
  @ApiOperation({ summary: '發放本店專屬優惠券給指定會員' })
  grant(
    @Param('organizationSlug') organizationSlug: string,
    @Param('couponId') couponId: string,
    @Body() dto: GrantCouponDto,
  ): Promise<UserCouponResponseDto> {
    return this.couponsService.grantForOrganization(
      organizationSlug,
      couponId,
      dto.email,
    );
  }
}
