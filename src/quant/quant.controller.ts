import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminGuard } from 'src/common/guards/admin.guard';

import {
  QuantCandleDto,
  QuantCandleQueryDto,
  QuantFundingRateDto,
  QuantFundingRateQueryDto,
  QuantMarketDto,
  QuantMarketsQueryDto,
  QuantPerpInfoDto,
  QuantTradeDto,
} from './dto/quant-market.dto';
import { QuantMarketService } from './market/quant-market.service';

@ApiTags('quant')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('quant')
export class QuantController {
  constructor(private readonly market: QuantMarketService) {}

  @Get('markets')
  @ApiOperation({ summary: '列出可交易的現貨或合約交易對與 24 小時行情' })
  findMarkets(
    @Query() { type }: QuantMarketsQueryDto,
  ): Promise<QuantMarketDto[]> {
    return this.market.listMarkets(type);
  }

  @Get('markets/:symbol/perp')
  @ApiOperation({ summary: '合約的標記價格、資金費率、未平倉量與風險限額' })
  findPerpInfo(@Param('symbol') symbol: string): Promise<QuantPerpInfoDto> {
    return this.market.findPerpInfo(symbol);
  }

  @Get('markets/:symbol/funding-rates')
  @ApiOperation({ summary: '合約的歷史資金費率（時間由舊到新）' })
  findFundingRates(
    @Param('symbol') symbol: string,
    @Query() { endTime, limit }: QuantFundingRateQueryDto,
  ): Promise<QuantFundingRateDto[]> {
    return this.market.findFundingRates(symbol, limit, endTime);
  }

  @Get('markets/:symbol/candles')
  @ApiOperation({ summary: '取得 K 線（時間由舊到新）' })
  findCandles(
    @Param('symbol') symbol: string,
    @Query() { endTime, interval, limit }: QuantCandleQueryDto,
  ): Promise<QuantCandleDto[]> {
    return this.market.findCandles(symbol, interval, limit, endTime);
  }

  @Get('markets/:symbol/trades')
  @ApiOperation({ summary: '取得最近成交（時間由新到舊）' })
  findTrades(@Param('symbol') symbol: string): Promise<QuantTradeDto[]> {
    return this.market.findTrades(symbol);
  }
}
