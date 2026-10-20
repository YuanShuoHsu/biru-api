import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { AdminGuard } from 'src/common/guards/admin.guard';

import {
  CreateAiBacktestDto,
  QuantAgentTokenCreatedDto,
  QuantAgentTokenDto,
  QuantAiBacktestDto,
  QuantAiRequestDto,
} from '../dto/quant-bot.dto';

import { QuantAiAgentService } from './quant-ai-agent.service';
import { QuantAiBacktestService } from './quant-ai-backtest.service';

@ApiTags('quant')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('quant')
export class QuantAiAdminController {
  constructor(
    private readonly agent: QuantAiAgentService,
    private readonly backtests: QuantAiBacktestService,
  ) {}

  @Get('agent-token')
  @ApiOperation({
    summary: '取得 Claude Code 連線 token 的狀態（只回末 4 碼）',
  })
  findToken(@Session() { user }: UserSession): Promise<QuantAgentTokenDto> {
    return this.agent.findToken(user.id);
  }

  @Post('agent-token')
  @ApiOperation({ summary: '產生新的 Claude Code 連線 token，舊的立即失效' })
  regenerateToken(
    @Session() { user }: UserSession,
  ): Promise<QuantAgentTokenCreatedDto> {
    return this.agent.regenerateToken(user.id);
  }

  @Delete('agent-token')
  @HttpCode(204)
  @ApiOperation({ summary: '撤銷 Claude Code 連線 token' })
  removeToken(@Session() { user }: UserSession): Promise<void> {
    return this.agent.removeToken(user.id);
  }

  @Get('bots/:id/ai-requests')
  @ApiOperation({ summary: 'Claude Code 機器人最近的判斷請求與待確認建議' })
  listRequests(
    @Param('id') id: string,
    @Session() { user }: UserSession,
  ): Promise<QuantAiRequestDto[]> {
    return this.agent.listForBot(user.id, id);
  }

  @Post('bots/:id/ai-requests/:requestId/approve')
  @HttpCode(204)
  @ApiOperation({ summary: '確認 AI 建議並實際下單' })
  approve(
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Session() { user }: UserSession,
  ): Promise<void> {
    return this.agent.approve(user.id, id, requestId);
  }

  @Post('bots/:id/ai-requests/:requestId/reject')
  @HttpCode(204)
  @ApiOperation({ summary: '略過 AI 建議，不下單' })
  reject(
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Session() { user }: UserSession,
  ): Promise<void> {
    return this.agent.reject(user.id, id, requestId);
  }

  @Get('ai-backtests')
  @ApiOperation({ summary: '最近的 AI 回測' })
  listBacktests(
    @Session() { user }: UserSession,
  ): Promise<QuantAiBacktestDto[]> {
    return this.backtests.list(user.id);
  }

  @Post('ai-backtests')
  @ApiOperation({
    summary:
      '建立 AI 回測：K 線固定後逐根取得判斷（Claude Code 或 Claude API）',
  })
  createBacktest(
    @Body() dto: CreateAiBacktestDto,
    @Session() { user }: UserSession,
  ): Promise<QuantAiBacktestDto> {
    return this.backtests.create(user.id, dto);
  }

  @Get('ai-backtests/:id')
  @ApiOperation({ summary: '取得 AI 回測進度與結果' })
  findBacktest(
    @Param('id') id: string,
    @Session() { user }: UserSession,
  ): Promise<QuantAiBacktestDto> {
    return this.backtests.find(user.id, id);
  }

  @Post('ai-backtests/:id/cancel')
  @ApiOperation({ summary: '停止進行中的 AI 回測' })
  cancelBacktest(
    @Param('id') id: string,
    @Session() { user }: UserSession,
  ): Promise<QuantAiBacktestDto> {
    return this.backtests.cancel(user.id, id);
  }

  @Delete('ai-backtests/:id')
  @HttpCode(204)
  @ApiOperation({ summary: '刪除 AI 回測' })
  removeBacktest(
    @Param('id') id: string,
    @Session() { user }: UserSession,
  ): Promise<void> {
    return this.backtests.remove(user.id, id);
  }
}
