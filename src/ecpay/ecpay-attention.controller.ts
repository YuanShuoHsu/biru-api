import { EcpayAttentionItemDto } from './dto/ecpay-attention.dto';

import { EcpayAttentionService } from './services/ecpay-attention.service';

import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from 'src/menus/decorators/roles.decorator';

@ApiTags('orders')
@Controller('organizations/:organizationSlug/ecpay/attention')
export class EcpayAttentionController {
  constructor(private readonly ecpayAttentionService: EcpayAttentionService) {}

  @Get()
  @Roles({ order: ['read'] }, 'organizationSlug')
  @ApiOkResponse({ type: [EcpayAttentionItemDto] })
  @ApiOperation({
    summary: '列出綠界流程中需要人工處理的項目（補正 cron 收斂不掉的殘留）',
  })
  findAll(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<EcpayAttentionItemDto[]> {
    return this.ecpayAttentionService.findByOrganization(organizationSlug);
  }
}
