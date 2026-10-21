import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { WebhookSignalDto } from '../dto/quant-bot.dto.js';

import { QuantBotsService } from './quant-bots.service.js';

// TradingView 的 alert 沒有登入狀態，改由 body 裡的 token 驗證
@AllowAnonymous()
@ApiTags('quant')
@Controller('quant/webhooks')
export class QuantWebhookController {
  constructor(private readonly bots: QuantBotsService) {}

  @Post(':botId')
  @HttpCode(204)
  @ApiOperation({ summary: '接收 TradingView 等外部訊號' })
  receive(
    @Param('botId') botId: string,
    @Body() dto: WebhookSignalDto,
  ): Promise<void> {
    return this.bots.receiveWebhook(botId, dto);
  }
}
