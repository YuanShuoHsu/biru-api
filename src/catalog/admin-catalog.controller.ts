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
  CatalogItemListResponseDto,
  CatalogItemResponseDto,
} from './dto/catalog-item-response.dto.js';
import {
  CatalogModifierGroupListResponseDto,
  CatalogModifierGroupResponseDto,
} from './dto/catalog-modifier-group-response.dto.js';
import {
  CatalogModifierListResponseDto,
  CatalogModifierResponseDto,
} from './dto/catalog-modifier-response.dto.js';
import {
  CatalogSectionListResponseDto,
  CatalogSectionResponseDto,
} from './dto/catalog-section-response.dto.js';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto.js';
import { CreateCatalogModifierGroupDto } from './dto/create-catalog-modifier-group.dto.js';
import { CreateCatalogModifierDto } from './dto/create-catalog-modifier.dto.js';
import { CreateCatalogSectionDto } from './dto/create-catalog-section.dto.js';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto.js';
import { UpdateCatalogModifierGroupDto } from './dto/update-catalog-modifier-group.dto.js';
import { UpdateCatalogModifierDto } from './dto/update-catalog-modifier.dto.js';
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

  @Post('sections/:catalogSectionId/items')
  @Audit('catalogItem', { response: true })
  @ApiOperation({ summary: '在品牌目錄分類建立品項' })
  async createItem(
    @Param('catalogSectionId') catalogSectionId: string,
    @Body() dto: CreateCatalogItemDto,
  ): Promise<CatalogItemResponseDto> {
    return withImageUrl(
      'catalogItem',
      await this.catalogService.createItem(catalogSectionId, dto),
    );
  }

  @Get('sections/:catalogSectionId/items')
  @ApiOperation({ summary: '取得目錄分類的所有品項' })
  @ApiOkResponse({ type: CatalogItemListResponseDto })
  async findAllItems(
    @Param('catalogSectionId') catalogSectionId: string,
  ): Promise<CatalogItemListResponseDto> {
    const data = await this.catalogService.items(catalogSectionId);

    return {
      data: data.map((row) => withImageRefUrl('catalogItem', row)),
      total: data.length,
    };
  }

  @Patch('sections/:catalogSectionId/items/reorder')
  @Audit('catalogItem', { body: 'ids' })
  @ApiOperation({ summary: '重新排序目錄分類內的品項' })
  reorderItems(
    @Param('catalogSectionId') catalogSectionId: string,
    @Body() { ids }: ReorderDto,
  ): Promise<void> {
    return this.catalogService.reorderItems(catalogSectionId, ids);
  }

  @Get('items/:catalogItemId')
  @ApiOperation({ summary: '取得目錄品項詳情' })
  async findItem(
    @Param('catalogItemId') catalogItemId: string,
  ): Promise<CatalogItemResponseDto> {
    return withImageUrl(
      'catalogItem',
      await this.catalogService.item(catalogItemId),
    );
  }

  @Patch('items/:catalogItemId')
  @Audit('catalogItem', { param: 'catalogItemId' })
  @ApiOperation({ summary: '更新目錄品項' })
  async updateItem(
    @Param('catalogItemId') catalogItemId: string,
    @Body() dto: UpdateCatalogItemDto,
  ): Promise<CatalogItemResponseDto> {
    return withImageUrl(
      'catalogItem',
      await this.catalogService.updateItem(catalogItemId, dto),
    );
  }

  @Delete('items/:catalogItemId')
  @Audit('catalogItem', { param: 'catalogItemId' })
  @ApiOperation({ summary: '刪除目錄品項' })
  async deleteItem(
    @Param('catalogItemId') catalogItemId: string,
  ): Promise<CatalogItemResponseDto> {
    return withImageUrl(
      'catalogItem',
      await this.catalogService.deleteItem(catalogItemId),
    );
  }

  @Post('modifier-groups')
  @Audit('catalogModifierGroup', { response: true })
  @ApiOperation({ summary: '建立品牌目錄選項群組' })
  createModifierGroup(
    @Body() dto: CreateCatalogModifierGroupDto,
  ): Promise<CatalogModifierGroupResponseDto> {
    return this.catalogService.createModifierGroup(dto);
  }

  @Get('modifier-groups')
  @ApiOperation({ summary: '取得所有目錄選項群組' })
  @ApiOkResponse({ type: CatalogModifierGroupListResponseDto })
  async findAllModifierGroups(): Promise<CatalogModifierGroupListResponseDto> {
    const data = await this.catalogService.modifierGroups();

    return { data, total: data.length };
  }

  @Patch('modifier-groups/reorder')
  @Audit('catalogModifierGroup', { body: 'ids' })
  @ApiOperation({ summary: '重新排序目錄選項群組' })
  reorderModifierGroups(@Body() { ids }: ReorderDto): Promise<void> {
    return this.catalogService.reorderModifierGroups(ids);
  }

  @Get('modifier-groups/:catalogModifierGroupId')
  @ApiOperation({ summary: '取得目錄選項群組詳情' })
  findModifierGroup(
    @Param('catalogModifierGroupId') catalogModifierGroupId: string,
  ): Promise<CatalogModifierGroupResponseDto> {
    return this.catalogService.modifierGroup(catalogModifierGroupId);
  }

  @Patch('modifier-groups/:catalogModifierGroupId')
  @Audit('catalogModifierGroup', { param: 'catalogModifierGroupId' })
  @ApiOperation({ summary: '更新目錄選項群組' })
  updateModifierGroup(
    @Param('catalogModifierGroupId') catalogModifierGroupId: string,
    @Body() dto: UpdateCatalogModifierGroupDto,
  ): Promise<CatalogModifierGroupResponseDto> {
    return this.catalogService.updateModifierGroup(catalogModifierGroupId, dto);
  }

  @Delete('modifier-groups/:catalogModifierGroupId')
  @Audit('catalogModifierGroup', { param: 'catalogModifierGroupId' })
  @ApiOperation({ summary: '刪除目錄選項群組與其選項' })
  deleteModifierGroup(
    @Param('catalogModifierGroupId') catalogModifierGroupId: string,
  ): Promise<CatalogModifierGroupResponseDto> {
    return this.catalogService.deleteModifierGroup(catalogModifierGroupId);
  }

  @Post('modifier-groups/:catalogModifierGroupId/modifiers')
  @Audit('catalogModifier', { response: true })
  @ApiOperation({ summary: '在目錄選項群組建立選項' })
  async createModifier(
    @Param('catalogModifierGroupId') catalogModifierGroupId: string,
    @Body() dto: CreateCatalogModifierDto,
  ): Promise<CatalogModifierResponseDto> {
    return withImageUrl(
      'catalogModifier',
      await this.catalogService.createModifier(catalogModifierGroupId, dto),
    );
  }

  @Get('modifier-groups/:catalogModifierGroupId/modifiers')
  @ApiOperation({ summary: '取得目錄選項群組的所有選項' })
  @ApiOkResponse({ type: CatalogModifierListResponseDto })
  async findAllModifiers(
    @Param('catalogModifierGroupId') catalogModifierGroupId: string,
  ): Promise<CatalogModifierListResponseDto> {
    const data = await this.catalogService.modifiers(catalogModifierGroupId);

    return {
      data: data.map((row) => withImageRefUrl('catalogModifier', row)),
      total: data.length,
    };
  }

  @Patch('modifier-groups/:catalogModifierGroupId/modifiers/reorder')
  @Audit('catalogModifier', { body: 'ids' })
  @ApiOperation({ summary: '重新排序目錄選項群組內的選項' })
  reorderModifiers(
    @Param('catalogModifierGroupId') catalogModifierGroupId: string,
    @Body() { ids }: ReorderDto,
  ): Promise<void> {
    return this.catalogService.reorderModifiers(catalogModifierGroupId, ids);
  }

  @Get('modifiers/:catalogModifierId')
  @ApiOperation({ summary: '取得目錄選項詳情' })
  async findModifier(
    @Param('catalogModifierId') catalogModifierId: string,
  ): Promise<CatalogModifierResponseDto> {
    return withImageUrl(
      'catalogModifier',
      await this.catalogService.modifier(catalogModifierId),
    );
  }

  @Patch('modifiers/:catalogModifierId')
  @Audit('catalogModifier', { param: 'catalogModifierId' })
  @ApiOperation({ summary: '更新目錄選項' })
  async updateModifier(
    @Param('catalogModifierId') catalogModifierId: string,
    @Body() dto: UpdateCatalogModifierDto,
  ): Promise<CatalogModifierResponseDto> {
    return withImageUrl(
      'catalogModifier',
      await this.catalogService.updateModifier(catalogModifierId, dto),
    );
  }

  @Delete('modifiers/:catalogModifierId')
  @Audit('catalogModifier', { param: 'catalogModifierId' })
  @ApiOperation({ summary: '刪除目錄選項' })
  async deleteModifier(
    @Param('catalogModifierId') catalogModifierId: string,
  ): Promise<CatalogModifierResponseDto> {
    return withImageUrl(
      'catalogModifier',
      await this.catalogService.deleteModifier(catalogModifierId),
    );
  }
}
