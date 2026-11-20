import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { Audit } from '../common/decorators/audit.decorator.js';
import { OrganizationId } from '../menus/decorators/organization-id.decorator.js';
import { Roles } from '../menus/decorators/roles.decorator.js';

import { OperatingCostPaginationQueryDto } from './dto/operating-cost-pagination-query.dto.js';
import {
  CreateOperatingCostDto,
  OperatingCostListResponseDto,
  OperatingCostResponseDto,
  UpdateOperatingCostDto,
} from './dto/operating-cost.dto.js';
import { OperatingCostsService } from './operating-costs.service.js';

@ApiTags('operating-costs')
@ApiParam({ name: 'organizationSlug', type: String })
@Controller('organizations/:organizationSlug/operating-costs')
export class OperatingCostsController {
  constructor(private readonly operatingCostsService: OperatingCostsService) {}

  @Get()
  @Roles({ operatingCost: ['read'] }, 'organizationSlug')
  @ApiOkResponse({ type: OperatingCostListResponseDto })
  @ApiOperation({ summary: '查詢門市固定成本列表' })
  findAll(
    @OrganizationId() organizationId: string,
    @Query() query: OperatingCostPaginationQueryDto,
  ): Promise<OperatingCostListResponseDto> {
    return this.operatingCostsService.findAll(organizationId, query);
  }

  @Get(':operatingCostId')
  @Roles({ operatingCost: ['read'] }, 'organizationSlug')
  @ApiOkResponse({ type: OperatingCostResponseDto })
  @ApiOperation({ summary: '查詢門市固定成本' })
  findOne(
    @OrganizationId() organizationId: string,
    @Param('operatingCostId') operatingCostId: string,
  ): Promise<OperatingCostResponseDto> {
    return this.operatingCostsService.findOne(organizationId, operatingCostId);
  }

  @Post()
  @Roles({ operatingCost: ['create'] }, 'organizationSlug')
  @Audit('operatingCost', { response: true })
  @ApiCreatedResponse({ type: OperatingCostResponseDto })
  @ApiOperation({
    summary: '新增門市固定成本；同類別同一生效月份只能有一筆',
  })
  create(
    @OrganizationId() organizationId: string,
    @Body() dto: CreateOperatingCostDto,
  ): Promise<OperatingCostResponseDto> {
    return this.operatingCostsService.create(organizationId, dto);
  }

  @Patch(':operatingCostId')
  @Roles({ operatingCost: ['update'] }, 'organizationSlug')
  @Audit('operatingCost', { param: 'operatingCostId' })
  @ApiOkResponse({ type: OperatingCostResponseDto })
  @ApiOperation({ summary: '更新門市固定成本' })
  update(
    @OrganizationId() organizationId: string,
    @Param('operatingCostId') operatingCostId: string,
    @Body() dto: UpdateOperatingCostDto,
  ): Promise<OperatingCostResponseDto> {
    return this.operatingCostsService.update(
      organizationId,
      operatingCostId,
      dto,
    );
  }

  @Delete(':operatingCostId')
  @HttpCode(204)
  @Roles({ operatingCost: ['delete'] }, 'organizationSlug')
  @Audit('operatingCost', { param: 'operatingCostId' })
  @ApiNoContentResponse()
  @ApiOperation({ summary: '刪除門市固定成本' })
  remove(
    @OrganizationId() organizationId: string,
    @Param('operatingCostId') operatingCostId: string,
  ): Promise<void> {
    return this.operatingCostsService.remove(organizationId, operatingCostId);
  }
}
