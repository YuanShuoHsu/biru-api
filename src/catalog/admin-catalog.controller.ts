import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Audit } from '../common/decorators/audit.decorator.js';
import { AdminGuard } from '../common/guards/admin.guard.js';
import { withImageRefUrl, withImageUrl } from '../images/image-url.js';
import { ReorderDto } from '../menus/dto/reorder.dto.js';

import { CatalogService } from './catalog.service.js';
import {
  CatalogSectionListResponseDto,
  CatalogSectionResponseDto,
} from './dto/catalog-section-response.dto.js';
import { CreateCatalogSectionDto } from './dto/create-catalog-section.dto.js';
import { UpdateCatalogSectionDto } from './dto/update-catalog-section.dto.js';

@ApiTags('catalog')
@UseGuards(AdminGuard)
@Controller('catalog')
export class AdminCatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Post('sections')
  @Audit('catalogSection', { response: true })
  @ApiOperation({ summary: '建立品牌目錄分類' })
  async createSection(
    @Body() dto: CreateCatalogSectionDto,
  ): Promise<CatalogSectionResponseDto> {
    return withImageUrl(
      'catalogSection',
      await this.catalogService.createSection(dto),
    );
  }

  @Get('sections')
  @ApiOperation({ summary: '取得所有目錄分類' })
  @ApiOkResponse({ type: CatalogSectionListResponseDto })
  async findAllSections(): Promise<CatalogSectionListResponseDto> {
    const data = await this.catalogService.sections();

    return {
      data: data.map((row) => withImageRefUrl('catalogSection', row)),
      total: data.length,
    };
  }

  @Patch('sections/reorder')
  @Audit('catalogSection', { body: 'ids' })
  @ApiOperation({ summary: '重新排序目錄分類' })
  reorderSections(@Body() { ids }: ReorderDto): Promise<void> {
    return this.catalogService.reorderSections(ids);
  }

  @Get('sections/:catalogSectionId')
  @ApiOperation({ summary: '取得目錄分類詳情' })
  async findSection(
    @Param('catalogSectionId') catalogSectionId: string,
  ): Promise<CatalogSectionResponseDto> {
    return withImageUrl(
      'catalogSection',
      await this.catalogService.section(catalogSectionId),
    );
  }

  @Patch('sections/:catalogSectionId')
  @Audit('catalogSection', { param: 'catalogSectionId' })
  @ApiOperation({ summary: '更新目錄分類' })
  async updateSection(
    @Param('catalogSectionId') catalogSectionId: string,
    @Body() dto: UpdateCatalogSectionDto,
  ): Promise<CatalogSectionResponseDto> {
    return withImageUrl(
      'catalogSection',
      await this.catalogService.updateSection(catalogSectionId, dto),
    );
  }

  @Delete('sections/:catalogSectionId')
  @Audit('catalogSection', { param: 'catalogSectionId' })
  @ApiOperation({ summary: '刪除目錄分類' })
  async deleteSection(
    @Param('catalogSectionId') catalogSectionId: string,
  ): Promise<CatalogSectionResponseDto> {
    return withImageUrl(
      'catalogSection',
      await this.catalogService.deleteSection(catalogSectionId),
    );
  }
}
