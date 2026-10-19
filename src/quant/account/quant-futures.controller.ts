import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { AdminGuard } from 'src/common/guards/admin.guard';

import { PlaceQuantOrderResponseDto } from '../dto/quant-account.dto';
import {
  AdjustIsolatedMarginDto,
  PlaceFuturesOrderDto,
  PreviewFuturesOrderDto,
  QuantFundingFeeDto,
  QuantFuturesAccountDto,
  QuantFuturesFillHistoryQueryDto,
  QuantFuturesFillPageDto,
  QuantFuturesOrderDto,
  QuantFuturesOrderHistoryQueryDto,
  QuantFuturesOrderPageDto,
  QuantFuturesOrderPreviewDto,
  QuantFuturesSymbolQueryDto,
  QuantFuturesSymbolSettingsDto,
  QuantOptionalSymbolQueryDto,
  QuantPositionDto,
  QuantPositionHistoryDto,
  SetLeverageDto,
  SetMarginModeDto,
  SetPositionModeDto,
} from '../dto/quant-futures.dto';

import { QuantFuturesService } from './quant-futures.service';

@ApiTags('quant')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('quant/credentials/:id/futures')
export class QuantFuturesController {
  constructor(private readonly futures: QuantFuturesService) {}

  @Get()
  @ApiOperation({ summary: '取得合約帳戶的保證金與持倉模式' })
  findAccount(
    @Param('id') id: string,
    @Session() { user }: UserSession,
  ): Promise<QuantFuturesAccountDto> {
    return this.futures.findAccount(user.id, id);
  }

  @Put('position-mode')
  @HttpCode(204)
  @ApiOperation({ summary: '切換單向／雙向持倉（整個帳戶共用）' })
  setPositionMode(
    @Param('id') id: string,
    @Body() { positionMode }: SetPositionModeDto,
    @Session() { user }: UserSession,
  ): Promise<void> {
    return this.futures.setPositionMode(user.id, id, positionMode);
  }

  @Get('settings')
  @ApiOperation({ summary: '取得交易對的槓桿與保證金模式' })
  findSymbolSettings(
    @Param('id') id: string,
    @Query() { symbol }: QuantFuturesSymbolQueryDto,
    @Session() { user }: UserSession,
  ): Promise<QuantFuturesSymbolSettingsDto> {
    return this.futures.findSymbolSettings(user.id, id, symbol);
  }

  @Put('leverage')
  @HttpCode(204)
  @ApiOperation({ summary: '調整交易對的槓桿' })
  setLeverage(
    @Param('id') id: string,
    @Body() { leverage, symbol }: SetLeverageDto,
    @Session() { user }: UserSession,
  ): Promise<void> {
    return this.futures.setLeverage(user.id, id, symbol, leverage);
  }

  @Put('margin-mode')
  @HttpCode(204)
  @ApiOperation({ summary: '切換交易對的全倉／逐倉' })
  setMarginMode(
    @Param('id') id: string,
    @Body() { marginMode, symbol }: SetMarginModeDto,
    @Session() { user }: UserSession,
  ): Promise<void> {
    return this.futures.setMarginMode(user.id, id, symbol, marginMode);
  }

  @Post('isolated-margin')
  @HttpCode(204)
  @ApiOperation({ summary: '追加或減少逐倉保證金' })
  adjustIsolatedMargin(
    @Param('id') id: string,
    @Body() dto: AdjustIsolatedMarginDto,
    @Session() { user }: UserSession,
  ): Promise<void> {
    return this.futures.adjustIsolatedMargin(user.id, id, dto);
  }

  @Get('positions')
  @ApiOperation({ summary: '取得目前持倉' })
  findPositions(
    @Param('id') id: string,
    @Query() { symbol }: QuantOptionalSymbolQueryDto,
    @Session() { user }: UserSession,
  ): Promise<QuantPositionDto[]> {
    return this.futures.listPositions(user.id, id, symbol);
  }

  @Get('position-history')
  @ApiOperation({ summary: '取得已平倉的歷史持倉' })
  findPositionHistory(
    @Param('id') id: string,
    @Query() { symbol }: QuantOptionalSymbolQueryDto,
    @Session() { user }: UserSession,
  ): Promise<QuantPositionHistoryDto[]> {
    return this.futures.listPositionHistory(user.id, id, symbol);
  }

  @Get('open-orders')
  @ApiOperation({ summary: '取得未完成的合約委託' })
  findOpenOrders(
    @Param('id') id: string,
    @Query() { symbol }: QuantOptionalSymbolQueryDto,
    @Session() { user }: UserSession,
  ): Promise<QuantFuturesOrderDto[]> {
    return this.futures.listOpenOrders(user.id, id, symbol);
  }

  @Delete('open-orders')
  @HttpCode(204)
  @ApiOperation({ summary: '撤銷交易對的全部合約委託' })
  cancelAll(
    @Param('id') id: string,
    @Query() { symbol }: QuantFuturesSymbolQueryDto,
    @Session() { user }: UserSession,
  ): Promise<void> {
    return this.futures.cancelAllOrders(user.id, id, symbol);
  }

  @Get('orders')
  @ApiOperation({ summary: '取得已結束的合約委託（依時間由新到舊分頁）' })
  findOrders(
    @Param('id') id: string,
    @Query() query: QuantFuturesOrderHistoryQueryDto,
    @Session() { user }: UserSession,
  ): Promise<QuantFuturesOrderPageDto> {
    return this.futures.listOrders(user.id, id, query);
  }

  @Post('orders')
  @ApiOperation({ summary: '合約下單（實盤）' })
  placeOrder(
    @Param('id') id: string,
    @Body() dto: PlaceFuturesOrderDto,
    @Session() { user }: UserSession,
  ): Promise<PlaceQuantOrderResponseDto> {
    return this.futures.placeOrder(user.id, id, dto);
  }

  @Post('orders/preview')
  @HttpCode(200)
  @ApiOperation({
    summary: '試算合約委託的保證金與成交後預估強平價（不會下單）',
  })
  previewOrder(
    @Param('id') id: string,
    @Body() dto: PreviewFuturesOrderDto,
    @Session() { user }: UserSession,
  ): Promise<QuantFuturesOrderPreviewDto> {
    return this.futures.previewOrder(user.id, id, dto);
  }

  @Delete('orders/:orderId')
  @HttpCode(204)
  @ApiOperation({ summary: '撤銷合約委託' })
  cancelOrder(
    @Param('id') id: string,
    @Param('orderId') orderId: string,
    @Query() { symbol }: QuantFuturesSymbolQueryDto,
    @Session() { user }: UserSession,
  ): Promise<void> {
    return this.futures.cancelOrder(user.id, id, symbol, orderId);
  }

  @Get('fills')
  @ApiOperation({ summary: '取得合約成交紀錄（依時間由新到舊分頁）' })
  findFills(
    @Param('id') id: string,
    @Query() query: QuantFuturesFillHistoryQueryDto,
    @Session() { user }: UserSession,
  ): Promise<QuantFuturesFillPageDto> {
    return this.futures.listFills(user.id, id, query);
  }

  @Get('funding-fees')
  @ApiOperation({ summary: '取得資金費收付紀錄' })
  findFundingFees(
    @Param('id') id: string,
    @Query() { symbol }: QuantOptionalSymbolQueryDto,
    @Session() { user }: UserSession,
  ): Promise<QuantFundingFeeDto[]> {
    return this.futures.listFundingFees(user.id, id, symbol);
  }
}
