import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { AdminGuard } from 'src/common/guards/admin.guard';

import { QuantAiKeyDto, SetQuantAiKeyDto } from '../dto/quant-bot.dto';

import { QuantAiAdvisorService } from './quant-ai-advisor.service';
import { QuantAiKeyService } from './quant-ai-key.service';

// Claude API key 只屬於綁定者本人，平台管理員彼此也看不到
@ApiTags('quant')
@ApiBearerAuth()
@UseGuards(AdminGuard)
@Controller('quant/ai-key')
export class QuantAiController {
  constructor(
    private readonly aiKeys: QuantAiKeyService,
    private readonly advisor: QuantAiAdvisorService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '取得自己綁定的 Claude API key（只回末 4 碼）與本月費用',
  })
  async find(@Session() { user }: UserSession): Promise<QuantAiKeyDto> {
    const [key, monthCost] = await Promise.all([
      this.aiKeys.find(user.id),
      this.advisor.userMonthCost(user.id),
    ]);

    return { ...key, monthCost };
  }

  @Put()
  @ApiOperation({
    summary: '綁定或更換 Claude API key（會先向 Anthropic 驗證）',
  })
  async set(
    @Body() { apiKey }: SetQuantAiKeyDto,
    @Session() { user }: UserSession,
  ): Promise<QuantAiKeyDto> {
    const key = await this.aiKeys.set(user.id, apiKey);

    return { ...key, monthCost: await this.advisor.userMonthCost(user.id) };
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: '解除綁定 Claude API key' })
  remove(@Session() { user }: UserSession): Promise<void> {
    return this.aiKeys.remove(user.id);
  }
}
