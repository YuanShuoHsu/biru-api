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
import {
  ApiBearerAuth,
  ApiExtraModels,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { AdminGuard } from 'src/common/guards/admin.guard';

import { QuantSymbolQueryDto } from '../dto/quant-account.dto';
import {
  BacktestResultDto,
  CreateAiBotDto,
  CreateDcaBotDto,
  CreateGridBotDto,
  CreateIndicatorBotDto,
  CreateQuantBotResponseDto,
  CreateSignalBotDto,
  CreateWebhookBotDto,
  CreateFuturesGridBotDto,
  DcaBacktestDto,
  FuturesGridBacktestDto,
  FuturesGridCheckDto,
  FuturesGridCheckResultDto,
  FuturesGridOperationCheckDto,
  FuturesGridOperationDto,
  GridAiStrategyDto,
  GridBacktestDto,
  GridCheckDto,
  GridCheckResultDto,
  GridOperationDto,
  IndicatorBacktestDto,
  QuantBotDto,
  QuantBotEquityPointDto,
  QuantBotEventDto,
  QuantBotEventPaginationQueryDto,
  QuantBotFillDto,
  QuantBotFillMarkerDto,
  QuantBotFillMarkerQueryDto,
  QuantBotFillPaginationQueryDto,
  QuantBotOrderDto,
  QuantBotOrderPaginationQueryDto,
  QuantBotPaginationQueryDto,
  SendSignalDto,
  SignalSetupDto,
  WebhookTokenDto,
} from '../dto/quant-bot.dto';

import { QuantBacktestService } from './quant-backtest.service';
import { QuantBotsService } from './quant-bots.service';

// 機器人只屬於建立者本人，平台管理員彼此也看不到
@ApiTags('quant')
@ApiBearerAuth()
@ApiExtraModels(QuantBotEventDto, QuantBotFillDto, QuantBotOrderDto)
@UseGuards(AdminGuard)
@Controller('quant')
export class QuantBotsController {
  constructor(
    private readonly backtest: QuantBacktestService,
    private readonly bots: QuantBotsService,
  ) {}

  @Get('bots')
  @ApiOperation({ summary: '列出自己的機器人（不含已封存）' })
  findAll(
    @Query() query: QuantBotPaginationQueryDto,
    @Session() { user }: UserSession,
  ): Promise<{ data: QuantBotDto[]; total: number }> {
    return this.bots.list(user.id, query);
  }

  @Post('bots/grid')
  @ApiOperation({ summary: '建立網格機器人（實盤交給 Pionex 內建網格執行）' })
  createGrid(
    @Body() dto: CreateGridBotDto,
    @Session() { user }: UserSession,
  ): Promise<CreateQuantBotResponseDto> {
    return this.bots.create(user.id, 'grid', dto);
  }

  @Post('bots/grid/check')
  @HttpCode(200)
  @ApiOperation({
    summary: '向 Pionex 試算網格的投入範圍與每格數量（不會下單）',
  })
  checkGrid(
    @Body() dto: GridCheckDto,
    @Session() { user }: UserSession,
  ): Promise<GridCheckResultDto> {
    return this.bots.gridCheck(user.id, dto);
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

  @Post('bots/signal')
  @ApiOperation({
    summary: '建立訊號機器人（Pionex 自訂訊號＋智慧跟單，只能實盤）',
  })
  createSignal(
    @Body() dto: CreateSignalBotDto,
    @Session() { user }: UserSession,
  ): Promise<CreateQuantBotResponseDto> {
    return this.bots.create(user.id, 'signal', dto);
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

  @Post('bots/ai')
  @ApiOperation({ summary: '建立 AI 交易機器人' })
  createAi(
    @Body() dto: CreateAiBotDto,
    @Session() { user }: UserSession,
  ): Promise<CreateQuantBotResponseDto> {
    return this.bots.create(user.id, 'ai', dto);
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

  @Get('bots/:id/signal')
  @ApiOperation({
    summary: '訊號機器人在 TradingView 要填的 Webhook URL 與訊息',
  })
  findSignalSetup(
    @Param('id') id: string,
    @Session() { user }: UserSession,
  ): Promise<SignalSetupDto> {
    return this.bots.signalSetup(user.id, id);
  }

  @Post('bots/:id/signal')
  @HttpCode(204)
  @ApiOperation({ summary: '手動送出一筆訊號給訊號機器人（會實際下單）' })
  sendSignal(
    @Param('id') id: string,
    @Body() dto: SendSignalDto,
    @Session() { user }: UserSession,
  ): Promise<void> {
    return this.bots.sendSignal(user.id, id, dto);
  }

  @Post('bots/:id/grid/operate')
  @HttpCode(204)
  @ApiOperation({
    summary: '調整執行中的 Pionex 現貨網格：追加投入、改區間、提取利潤',
  })
  operateGrid(
    @Param('id') id: string,
    @Body() dto: GridOperationDto,
    @Session() { user }: UserSession,
  ): Promise<void> {
    return this.bots.gridOperation(user.id, id, dto);
  }

  @Post('bots/:id/futures-grid/check')
  @HttpCode(200)
  @ApiOperation({ summary: '向 Pionex 試算合約網格的調整（不會執行）' })
  checkFuturesGridOperation(
    @Param('id') id: string,
    @Body() dto: FuturesGridOperationDto,
    @Session() { user }: UserSession,
  ): Promise<FuturesGridOperationCheckDto> {
    return this.bots.futuresGridOperation(user.id, id, dto, true);
  }

  @Post('bots/:id/futures-grid/operate')
  @HttpCode(200)
  @ApiOperation({
    summary:
      '調整執行中的 Pionex 合約網格：追加投入、改區間、減倉、暫停、恢復、調整保證金、改停利停損',
  })
  operateFuturesGrid(
    @Param('id') id: string,
    @Body() dto: FuturesGridOperationDto,
    @Session() { user }: UserSession,
  ): Promise<FuturesGridOperationCheckDto> {
    return this.bots.futuresGridOperation(user.id, id, dto, false);
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
    @Query() query: QuantBotOrderPaginationQueryDto,
    @Session() { user }: UserSession,
  ): Promise<{ data: QuantBotOrderDto[]; total: number }> {
    return this.bots.listOrders(user.id, id, query);
  }

  @Get('bots/:id/fills')
  @ApiOperation({ summary: '機器人的成交' })
  findFills(
    @Param('id') id: string,
    @Query() query: QuantBotFillPaginationQueryDto,
    @Session() { user }: UserSession,
  ): Promise<{ data: QuantBotFillDto[]; total: number }> {
    return this.bots.listFills(user.id, id, query);
  }

  @Get('bots/:id/fill-markers')
  @ApiOperation({ summary: '機器人在一段時間內的成交，供 K 線圖標記' })
  findFillMarkers(
    @Param('id') id: string,
    @Query() { since }: QuantBotFillMarkerQueryDto,
    @Session() { user }: UserSession,
  ): Promise<QuantBotFillMarkerDto[]> {
    return this.bots.listFillMarkers(user.id, id, since);
  }

  @Get('bots/:id/equity')
  @ApiOperation({ summary: '機器人的權益曲線（每 5 分鐘取樣）' })
  findEquity(
    @Param('id') id: string,
    @Session() { user }: UserSession,
  ): Promise<QuantBotEquityPointDto[]> {
    return this.bots.listEquity(user.id, id);
  }

  @Get('bots/:id/events')
  @ApiOperation({ summary: '機器人的事件紀錄' })
  findEvents(
    @Param('id') id: string,
    @Query() query: QuantBotEventPaginationQueryDto,
    @Session() { user }: UserSession,
  ): Promise<{ data: QuantBotEventDto[]; total: number }> {
    return this.bots.listEvents(user.id, id, query);
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
