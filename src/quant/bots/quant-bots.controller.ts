import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { AdminGuard } from 'src/common/guards/admin.guard';

import { QuantSymbolQueryDto } from '../dto/quant-account.dto';
import {
  BacktestResultDto,
  CreateDcaBotDto,
  CreateGridBotDto,
  CreateIndicatorBotDto,
  CreateQuantBotResponseDto,
  CreateWebhookBotDto,
  CreateFuturesGridBotDto,
  DcaBacktestDto,
  FuturesGridBacktestDto,
  FuturesGridCheckDto,
  FuturesGridCheckResultDto,
  GridAiStrategyDto,
  GridBacktestDto,
  IndicatorBacktestDto,
  QuantBotDto,
  QuantBotEventDto,
  QuantBotFillDto,
  QuantBotOrderDto,
  WebhookTokenDto,
} from '../dto/quant-bot.dto';

import { QuantBacktestService } from './quant-backtest.service';
import { QuantBotsService } from './quant-bots.service';

// 機器人只屬於建立者本人，平台管理員彼此也看不到
@ApiTags('quant')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('quant')
export class QuantBotsController {
  constructor(
    private readonly backtest: QuantBacktestService,
    private readonly bots: QuantBotsService,
  ) {}

  @Get('bots')
  @ApiOperation({ summary: '列出自己的機器人（不含已封存）' })
  findAll(@Session() { user }: UserSession): Promise<QuantBotDto[]> {
    return this.bots.list(user.id);
  }

  @Post('bots/grid')
  @ApiOperation({ summary: '建立網格機器人（實盤交給 Pionex 內建網格執行）' })
  createGrid(
    @Body() dto: CreateGridBotDto,
    @Session() { user }: UserSession,
  ): Promise<CreateQuantBotResponseDto> {
    return this.bots.create(user.id, 'grid', dto);
  }

  @Post('bots/futures_grid')
  @ApiOperation({
    summary: '建立合約網格機器人（實盤交給 Pionex 合約網格執行）',
  })
  createFuturesGrid(
    @Body() dto: CreateFuturesGridBotDto,
    @Session() { user }: UserSession,
  ): Promise<CreateQuantBotResponseDto> {
    return this.bots.create(user.id, 'futures_grid', dto);
  }

  @Post('bots/futures_grid/check')
  @HttpCode(200)
  @ApiOperation({
    summary: '向 Pionex 試算合約網格的投入範圍與預估強平價（不會下單）',
  })
  checkFuturesGrid(
    @Body() dto: FuturesGridCheckDto,
    @Session() { user }: UserSession,
  ): Promise<FuturesGridCheckResultDto> {
    return this.bots.futuresGridCheck(user.id, dto);
  }

  @Post('bots/dca')
  @ApiOperation({ summary: '建立 DCA 機器人' })
  createDca(
    @Body() dto: CreateDcaBotDto,
    @Session() { user }: UserSession,
  ): Promise<CreateQuantBotResponseDto> {
    return this.bots.create(user.id, 'dca', dto);
  }

  @Post('bots/indicator')
  @ApiOperation({ summary: '建立指標訊號機器人' })
  createIndicator(
    @Body() dto: CreateIndicatorBotDto,
    @Session() { user }: UserSession,
  ): Promise<CreateQuantBotResponseDto> {
    return this.bots.create(user.id, 'indicator', dto);
  }

  @Post('bots/webhook')
  @ApiOperation({ summary: '建立 TradingView Webhook 機器人' })
  createWebhook(
    @Body() dto: CreateWebhookBotDto,
    @Session() { user }: UserSession,
  ): Promise<CreateQuantBotResponseDto> {
    return this.bots.create(user.id, 'webhook', dto);
  }

  @Post('bots/stop-all')
  @HttpCode(204)
  @ApiOperation({ summary: '一鍵停止自己所有執行中的機器人' })
  stopAll(@Session() { user }: UserSession): Promise<void> {
    return this.bots.stopAll(user.id);
  }

  @Get('bots/:id')
  @ApiOperation({ summary: '取得機器人與損益摘要' })
  findOne(
    @Param('id') id: string,
    @Session() { user }: UserSession,
  ): Promise<QuantBotDto> {
    return this.bots.findOne(user.id, id);
  }

  @Post('bots/:id/start')
  @ApiOperation({ summary: '啟動機器人（每個機器人只能啟動一次）' })
  start(
    @Param('id') id: string,
    @Session() { user }: UserSession,
  ): Promise<QuantBotDto> {
    return this.bots.start(user.id, id);
  }

  @Post('bots/:id/stop')
  @ApiOperation({ summary: '停止機器人並撤銷掛單' })
  stop(
    @Param('id') id: string,
    @Session() { user }: UserSession,
  ): Promise<QuantBotDto> {
    return this.bots.stop(user.id, id);
  }

  @Post('bots/:id/webhook-token')
  @ApiOperation({ summary: '重新產生 Webhook token（舊的立即失效）' })
  regenerateWebhookToken(
    @Param('id') id: string,
    @Session() { user }: UserSession,
  ): Promise<WebhookTokenDto> {
    return this.bots.regenerateWebhookToken(user.id, id);
  }

  @Post('bots/:id/archive')
  @HttpCode(204)
  @ApiOperation({ summary: '封存已停止的機器人' })
  archive(
    @Param('id') id: string,
    @Session() { user }: UserSession,
  ): Promise<void> {
    return this.bots.archive(user.id, id);
  }

  @Get('bots/:id/orders')
  @ApiOperation({ summary: '機器人的委託' })
  findOrders(
    @Param('id') id: string,
    @Session() { user }: UserSession,
  ): Promise<QuantBotOrderDto[]> {
    return this.bots.listOrders(user.id, id);
  }

  @Get('bots/:id/fills')
  @ApiOperation({ summary: '機器人的成交' })
  findFills(
    @Param('id') id: string,
    @Session() { user }: UserSession,
  ): Promise<QuantBotFillDto[]> {
    return this.bots.listFills(user.id, id);
  }

  @Get('bots/:id/events')
  @ApiOperation({ summary: '機器人最近的事件紀錄' })
  findEvents(
    @Param('id') id: string,
    @Session() { user }: UserSession,
  ): Promise<QuantBotEventDto[]> {
    return this.bots.listEvents(user.id, id);
  }

  @Get('credentials/:id/grid-ai-strategy')
  @ApiOperation({ summary: 'Pionex 的網格 AI 推薦參數' })
  gridAiStrategy(
    @Param('id') id: string,
    @Query() { symbol }: QuantSymbolQueryDto,
    @Session() { user }: UserSession,
  ): Promise<GridAiStrategyDto> {
    return this.bots.gridAiStrategy(user.id, id, symbol);
  }

  @Post('backtests/grid')
  @HttpCode(200)
  @ApiOperation({ summary: '網格回測' })
  backtestGrid(@Body() dto: GridBacktestDto): Promise<BacktestResultDto> {
    return this.backtest.run('grid', dto);
  }

  @Post('backtests/futures_grid')
  @HttpCode(200)
  @ApiOperation({ summary: '合約網格回測（含資金費與強平）' })
  backtestFuturesGrid(
    @Body() dto: FuturesGridBacktestDto,
  ): Promise<BacktestResultDto> {
    return this.backtest.run('futures_grid', dto);
  }

  @Post('backtests/dca')
  @HttpCode(200)
  @ApiOperation({ summary: 'DCA 回測' })
  backtestDca(@Body() dto: DcaBacktestDto): Promise<BacktestResultDto> {
    return this.backtest.run('dca', dto);
  }

  @Post('backtests/indicator')
  @HttpCode(200)
  @ApiOperation({ summary: '指標訊號回測' })
  backtestIndicator(
    @Body() dto: IndicatorBacktestDto,
  ): Promise<BacktestResultDto> {
    return this.backtest.run('indicator', dto);
  }
}
