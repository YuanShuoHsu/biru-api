import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import {
  FrequentItemDto,
  FrequentItemsQueryDto,
} from './dto/frequent-items.dto.js';
import { FrequentItemsService } from './frequent-items.service.js';

@ApiBearerAuth()
@ApiTags('orders')
@Controller('users/me/frequent-items')
export class UserFrequentItemsController {
  constructor(private readonly frequentItemsService: FrequentItemsService) {}

  @Get()
  @ApiOkResponse({ type: [FrequentItemDto] })
  @ApiOperation({ summary: '查詢我在此門市常點的品項與上次的客製' })
  findAll(
    @Query() query: FrequentItemsQueryDto,
    @Session() session: UserSession,
  ): Promise<FrequentItemDto[]> {
    return this.frequentItemsService.findForUser(session.user.id, query);
  }
}
