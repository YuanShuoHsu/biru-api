import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { Audit } from 'src/common/decorators/audit.decorator';
import { AdminGuard } from 'src/common/guards/admin.guard';

import { CouponsService } from './coupons.service';
import { CouponPaginationQueryDto } from './dto/coupon-pagination-query.dto';
import { CouponRecipientQueryDto } from './dto/coupon-recipient-query.dto';
import {
  CouponRecipientListResponseDto,
  CouponResponseDto,
  UserCouponResponseDto,
} from './dto/coupon-response.dto';
import { CreateCouponDto, UpdateCouponDto } from './dto/create-coupon.dto';
import { GrantCouponDto } from './dto/grant-coupon.dto';

@ApiTags('coupons')
@UseGuards(AdminGuard)
@Controller('coupons')
export class AdminCouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post()
  @Audit('coupon', { response: true })
  @ApiOperation({ summary: '建立優惠券' })
  create(@Body() dto: CreateCouponDto): Promise<CouponResponseDto> {
    return this.couponsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '查詢優惠券列表' })
  findAll(
    @Query() query: CouponPaginationQueryDto,
  ): Promise<{ data: CouponResponseDto[]; total: number }> {
    return this.couponsService.findAll(query);
  }

  @Get(':couponId')
  @ApiOperation({ summary: '查詢優惠券' })
  findOne(@Param('couponId') couponId: string): Promise<CouponResponseDto> {
    return this.couponsService.findOne(couponId);
  }

  @Patch(':couponId')
  @Audit('coupon', { param: 'couponId' })
  @ApiOperation({ summary: '更新優惠券' })
  update(
    @Param('couponId') couponId: string,
    @Body() dto: UpdateCouponDto,
  ): Promise<CouponResponseDto> {
    return this.couponsService.update(couponId, dto);
  }

  @Delete(':couponId')
  @Audit('coupon', { param: 'couponId' })
  @ApiOperation({ summary: '刪除優惠券' })
  remove(@Param('couponId') couponId: string): Promise<void> {
    return this.couponsService.remove(couponId);
  }

  @Get(':couponId/recipients')
  @ApiOperation({ summary: '查詢優惠券持券紀錄' })
  @ApiOkResponse({ type: CouponRecipientListResponseDto })
  findRecipients(
    @Param('couponId') couponId: string,
    @Query() query: CouponRecipientQueryDto,
  ): Promise<CouponRecipientListResponseDto> {
    return this.couponsService.findRecipients(couponId, query);
  }

  @Post(':couponId/grant')
  @Audit('userCoupon', { response: true })
  @ApiOperation({ summary: '發放優惠券給指定會員' })
  grant(
    @Param('couponId') couponId: string,
    @Body() dto: GrantCouponDto,
    @Session() session: UserSession,
  ): Promise<UserCouponResponseDto> {
    return this.couponsService.grant(couponId, dto.email, session.user.id);
  }
}
