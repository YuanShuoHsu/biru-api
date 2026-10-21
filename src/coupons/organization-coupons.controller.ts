import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { Audit } from '../common/decorators/audit.decorator.js';

import { Roles } from '../menus/decorators/roles.decorator.js';

import { CouponsService } from './coupons.service.js';
import { CouponPaginationQueryDto } from './dto/coupon-pagination-query.dto.js';
import {
  CouponListResponseDto,
  UserCouponResponseDto,
} from './dto/coupon-response.dto.js';
import { GrantCouponDto } from './dto/grant-coupon.dto.js';

@ApiTags('coupons')
@Controller('organizations/:organizationSlug/coupons')
export class OrganizationCouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get()
  @Roles({ coupon: ['read'] }, 'organizationSlug')
  @ApiOperation({ summary: '查詢本店適用的優惠券列表' })
  @ApiOkResponse({ type: CouponListResponseDto })
  findAll(
    @Param('organizationSlug') organizationSlug: string,
    @Query() query: CouponPaginationQueryDto,
  ): Promise<CouponListResponseDto> {
    return this.couponsService.findAllForOrganization(organizationSlug, query);
  }

  @Post(':couponId/grant')
  @Roles({ coupon: ['create'] }, 'organizationSlug')
  @Audit('userCoupon', { response: true })
  @ApiOperation({ summary: '發放本店專屬優惠券給指定會員' })
  grant(
    @Param('organizationSlug') organizationSlug: string,
    @Param('couponId') couponId: string,
    @Body() dto: GrantCouponDto,
    @Session() session: UserSession,
  ): Promise<UserCouponResponseDto> {
    return this.couponsService.grantForOrganization(
      organizationSlug,
      couponId,
      dto.email,
      session.user.id,
    );
  }
}
