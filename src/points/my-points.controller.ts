import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { UserCouponResponseDto } from '../coupons/dto/coupon-response.dto';

import {
  MyPointsWalletDto,
  RedeemPointsDto,
} from './dto/points-response.dto';
import { PointsService } from './points.service';

@ApiTags('points')
@Controller('users/me/points')
export class MyPointsController {
  constructor(private readonly pointsService: PointsService) {}

  @Get()
  @ApiOperation({ summary: '我的點數（跨店，含可兌換優惠券與明細）' })
  getAllMine(@Session() session: UserSession): Promise<MyPointsWalletDto[]> {
    return this.pointsService.getAllMine(session.user.id);
  }

  @Post('redeem')
  @ApiOperation({ summary: '以點數兌換優惠券' })
  redeem(
    @Session() session: UserSession,
    @Body() dto: RedeemPointsDto,
  ): Promise<UserCouponResponseDto> {
    return this.pointsService.redeem(session.user.id, dto.couponId);
  }
}
