import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import {
  AiDecisionDto,
  QuantAgentConnectDto,
  QuantAgentConnectStatusDto,
  QuantAgentRequestDto,
} from '../dto/quant-bot.dto';

import { QuantAiAgentService } from './quant-ai-agent.service';

const bearer = (authorization?: string) =>
  authorization?.replace(/^Bearer\s+/i, '').trim() ?? '';

// 本機 Claude Code 代理沒有登入狀態，改用設定頁產生的 token 驗證；只能判斷，不能直接下實盤單
@AllowAnonymous()
@ApiTags('quant')
@ApiBearerAuth()
@Controller('quant/agent')
export class QuantAiAgentController {
  constructor(private readonly agent: QuantAiAgentService) {}

  @Post('connect')
  @ApiOperation({
    summary: '代理沒有可用 token 時發起連線，使用者在後台核准代碼後取得 token',
  })
  connect(): QuantAgentConnectDto {
    this.agent.assertAgentNeeded();
    return this.agent.startConnect();
  }

  @Get('connect/:id')
  @ApiOperation({ summary: '代理輪詢連線是否已核准；核准後回傳 token 一次' })
  pollConnect(@Param('id') id: string): QuantAgentConnectStatusDto {
    this.agent.assertAgentNeeded();
    return this.agent.pollConnect(id);
  }

  @Get('requests')
  @ApiOperation({ summary: '取得等待 Claude Code 判斷的請求' })
  async pending(
    @Headers('authorization') authorization?: string,
  ): Promise<QuantAgentRequestDto[]> {
    this.agent.assertAgentNeeded();
    return this.agent.pending(
      await this.agent.authenticate(bearer(authorization)),
    );
  }

  @Post('requests/:id')
  @HttpCode(204)
  @ApiOperation({
    summary: '回傳判斷；模擬盤與回測直接套用，實盤等使用者在後台確認',
  })
  async submit(
    @Param('id') id: string,
    @Body() dto: AiDecisionDto,
    @Headers('authorization') authorization?: string,
  ): Promise<void> {
    this.agent.assertAgentNeeded();
    await this.agent.submit(
      await this.agent.authenticate(bearer(authorization)),
      id,
      dto,
    );
  }
}
