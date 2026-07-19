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
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminGuard } from 'src/common/guards/admin.guard';

import { CouponsService } from './coupons.service';
import { CouponPaginationQueryDto } from './dto/coupon-pagination-query.dto';
import {
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

  @Patch(':couponId')
  @ApiOperation({ summary: '更新優惠券' })
  update(
    @Param('couponId') couponId: string,
    @Body() dto: UpdateCouponDto,
  ): Promise<CouponResponseDto> {
    return this.couponsService.update(couponId, dto);
  }

  @Delete(':couponId')
  @ApiOperation({ summary: '刪除優惠券' })
  remove(@Param('couponId') couponId: string): Promise<void> {
    return this.couponsService.remove(couponId);
  }

  @Post(':couponId/grant')
  @ApiOperation({ summary: '發放優惠券給指定會員' })
  grant(
    @Param('couponId') couponId: string,
    @Body() dto: GrantCouponDto,
  ): Promise<UserCouponResponseDto> {
    return this.couponsService.grant(couponId, dto.email);
  }
}
