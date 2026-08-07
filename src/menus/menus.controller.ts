import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from './decorators/roles.decorator';
import { AddOnPaginationQueryDto } from './dto/add-on-pagination-query.dto';
import { CreateMenuItemAddOnDto } from './dto/create-menu-item-add-on.dto';
import { CreateMenuItemModifierGroupDto } from './dto/create-menu-item-modifier-group.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { CreateMenuSectionDto } from './dto/create-menu-section.dto';
import { CreateModifierGroupDto } from './dto/create-modifier-group.dto';
import { CreateModifierDto } from './dto/create-modifier.dto';
import { CreateOfferDto } from './dto/create-offer.dto';
import { MenuItemAddOnResponseDto } from './dto/menu-item-add-on-response.dto';
import { MenuItemModifierGroupResponseDto } from './dto/menu-item-modifier-group-response.dto';
import { MenuItemResponseDto } from './dto/menu-item-response.dto';
import { MenuResponseDto } from './dto/menu-response.dto';
import { MenuSectionResponseDto } from './dto/menu-section-response.dto';
import { ModifierGroupResponseDto } from './dto/modifier-group-response.dto';
import { ModifierPaginationQueryDto } from './dto/modifier-pagination-query.dto';
import { ModifierResponseDto } from './dto/modifier-response.dto';
import { OfferResponseDto } from './dto/offer-response.dto';
import { MenuItemPaginationQueryDto } from './dto/menu-item-pagination-query.dto';
import { MenuSectionPaginationQueryDto } from './dto/menu-section-pagination-query.dto';
import { ModifierGroupPaginationQueryDto } from './dto/modifier-group-pagination-query.dto';
import { ReorderDto } from './dto/reorder.dto';
import { UpdateMenuItemAddOnDto } from './dto/update-menu-item-add-on.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { UpdateMenuSectionDto } from './dto/update-menu-section.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { UpdateModifierGroupDto } from './dto/update-modifier-group.dto';
import { UpdateModifierDto } from './dto/update-modifier.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { MenuEventsInterceptor } from './interceptors/menu-events.interceptor';
import { MenusService } from './menus.service';

@ApiTags('menus')
@ApiBearerAuth()
@Controller()
@UseInterceptors(MenuEventsInterceptor)
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  // ── Menu ──────────────────────────────────────────────────────────

  @Get('organizations/:organizationId/menus')
  @Roles({ menu: ['read'] }, 'organizationId')
  @ApiOperation({ summary: '取得組織所有菜單' })
  findAllMenus(
    @Param('organizationId') organizationId: string,
  ): Promise<MenuResponseDto[]> {
    return this.menusService.menus(organizationId);
  }

  @Get('menus/:menuId')
  @Roles({ menu: ['read'] }, 'menuId')
  @ApiOperation({ summary: '取得菜單詳情' })
  async findMenu(@Param('menuId') menuId: string): Promise<MenuResponseDto> {
    const result = await this.menusService.menu({ id: menuId });
    if (!result) throw new NotFoundException();

    return result;
  }

  @Patch('menus/:menuId')
  @Roles({ menu: ['update'] }, 'menuId')
  @ApiOperation({ summary: '更新菜單' })
  updateMenu(
    @Body() updateMenuDto: UpdateMenuDto,
    @Param('menuId') menuId: string,
  ): Promise<MenuResponseDto> {
    return this.menusService.updateMenu({
      where: { id: menuId },
      data: updateMenuDto,
    });
  }

  // ── MenuSection ───────────────────────────────────────────────────

  @Post('menus/:menuId/menu-sections')
  @Roles({ menu: ['create'] }, 'menuId')
  @ApiOperation({ summary: '建立菜單分類' })
  createMenuSection(
    @Body() createMenuSectionDto: CreateMenuSectionDto,
    @Param('menuId') menuId: string,
  ): Promise<MenuSectionResponseDto> {
    return this.menusService.createMenuSection(menuId, createMenuSectionDto);
  }

  @Get('menus/:menuId/menu-sections')
  @Roles({ menu: ['read'] }, 'menuId')
  @ApiOperation({ summary: '取得菜單所有分類' })
  findAllMenuSections(
    @Param('menuId') menuId: string,
    @Query() query: MenuSectionPaginationQueryDto,
  ): Promise<{ data: MenuSectionResponseDto[]; total: number }> {
    return this.menusService.menuSections(menuId, query);
  }

  @Patch('menus/:menuId/menu-sections/reorder')
  @Roles({ menu: ['update'] }, 'menuId')
  @ApiOperation({ summary: '重新排序菜單分類' })
  reorderMenuSections(
    @Body() { ids, offset }: ReorderDto,
    @Param('menuId') menuId: string,
  ): Promise<void> {
    return this.menusService.reorderMenuSections(menuId, ids, offset);
  }

  @Get('menu-sections/:sectionId')
  @Roles({ menu: ['read'] }, 'sectionId')
  @ApiOperation({ summary: '取得菜單分類詳情' })
  async findMenuSection(
    @Param('sectionId') sectionId: string,
  ): Promise<MenuSectionResponseDto> {
    const result = await this.menusService.menuSection({ id: sectionId });
    if (!result) throw new NotFoundException();

    return result;
  }

  @Patch('menu-sections/:sectionId')
  @Roles({ menu: ['update'] }, 'sectionId')
  @ApiOperation({ summary: '更新菜單分類' })
  updateMenuSection(
    @Body() updateMenuSectionDto: UpdateMenuSectionDto,
    @Param('sectionId') sectionId: string,
  ): Promise<MenuSectionResponseDto> {
    return this.menusService.updateMenuSection({
      where: { id: sectionId },
      data: updateMenuSectionDto,
    });
  }

  @Delete('menu-sections/:sectionId')
  @Roles({ menu: ['delete'] }, 'sectionId')
  @ApiOperation({ summary: '刪除菜單分類' })
  deleteMenuSection(
    @Param('sectionId') sectionId: string,
  ): Promise<MenuSectionResponseDto> {
    return this.menusService.deleteMenuSection({ id: sectionId });
  }

  // ── MenuItem ──────────────────────────────────────────────────────

  @Post('menu-sections/:sectionId/menu-items')
  @Roles({ menu: ['create'] }, 'sectionId')
  @ApiOperation({ summary: '建立菜單品項' })
  createMenuItem(
    @Body() createMenuItemDto: CreateMenuItemDto,
    @Param('sectionId') sectionId: string,
  ): Promise<MenuItemResponseDto> {
    return this.menusService.createMenuItem(sectionId, createMenuItemDto);
  }

  @Get('menu-sections/:sectionId/menu-items')
  @Roles({ menu: ['read'] }, 'sectionId')
  @ApiOperation({ summary: '取得分類所有品項' })
  findAllMenuSectionItems(
    @Param('sectionId') sectionId: string,
    @Query() query: MenuItemPaginationQueryDto,
  ): Promise<{ data: MenuItemResponseDto[]; total: number }> {
    return this.menusService.menuSectionItems(sectionId, query);
  }

  @Patch('menu-sections/:sectionId/menu-items/reorder')
  @Roles({ menu: ['update'] }, 'sectionId')
  @ApiOperation({ summary: '重新排序菜單品項' })
  reorderMenuItems(
    @Body() { ids, offset }: ReorderDto,
    @Param('sectionId') sectionId: string,
  ): Promise<void> {
    return this.menusService.reorderMenuItems(sectionId, ids, offset);
  }

  @Get('menu-items/:menuItemId')
  @Roles({ menu: ['read'] }, 'menuItemId')
  @ApiOperation({ summary: '取得菜單品項詳情' })
  async findMenuItem(
    @Param('menuItemId') menuItemId: string,
  ): Promise<MenuItemResponseDto> {
    const result = await this.menusService.menuItem({ id: menuItemId });
    if (!result) throw new NotFoundException();

    return result;
  }

  @Patch('menu-items/:menuItemId')
  @Roles({ menu: ['update'] }, 'menuItemId')
  @ApiOperation({ summary: '更新菜單品項' })
  updateMenuItem(
    @Body() updateMenuItemDto: UpdateMenuItemDto,
    @Param('menuItemId') menuItemId: string,
  ): Promise<MenuItemResponseDto> {
    return this.menusService.updateMenuItem({
      where: { id: menuItemId },
      data: updateMenuItemDto,
    });
  }

  @Delete('menu-items/:menuItemId')
  @Roles({ menu: ['delete'] }, 'menuItemId')
  @ApiOperation({ summary: '刪除菜單品項' })
  deleteMenuItem(
    @Param('menuItemId') menuItemId: string,
  ): Promise<MenuItemResponseDto> {
    return this.menusService.deleteMenuItem({ id: menuItemId });
  }

  // ── Offer ─────────────────────────────────────────────────────────

  @Post('menu-items/:menuItemId/offers')
  @Roles({ menu: ['create'] }, 'menuItemId')
  @ApiOperation({ summary: '建立品項定價' })
  createOffer(
    @Body() createOfferDto: CreateOfferDto,
    @Param('menuItemId') menuItemId: string,
  ): Promise<OfferResponseDto> {
    return this.menusService.createOffer(menuItemId, createOfferDto);
  }

  @Get('menu-items/:menuItemId/offers')
  @Roles({ menu: ['read'] }, 'menuItemId')
  @ApiOperation({ summary: '取得品項所有定價' })
  findAllOffers(
    @Param('menuItemId') menuItemId: string,
  ): Promise<OfferResponseDto[]> {
    return this.menusService.menuItemOffers(menuItemId);
  }

  @Patch('offers/:offerId')
  @Roles({ menu: ['update'] }, 'offerId')
  @ApiOperation({ summary: '更新品項定價' })
  updateOffer(
    @Body() updateOfferDto: UpdateOfferDto,
    @Param('offerId') offerId: string,
  ): Promise<OfferResponseDto> {
    return this.menusService.updateOffer({
      where: { id: offerId },
      data: updateOfferDto,
    });
  }

  @Delete('offers/:offerId')
  @Roles({ menu: ['delete'] }, 'offerId')
  @ApiOperation({ summary: '刪除品項定價' })
  deleteOffer(@Param('offerId') offerId: string): Promise<OfferResponseDto> {
    return this.menusService.deleteOffer({ id: offerId });
  }

  // ── MenuItemAddOn ─────────────────────────────────────────────────

  @Post('menu-items/:menuItemId/add-ons')
  @Roles({ menu: ['create'] }, 'menuItemId')
  @ApiOperation({ summary: '新增品項加購' })
  createMenuItemAddOn(
    @Body() createMenuItemAddOnDto: CreateMenuItemAddOnDto,
    @Param('menuItemId') menuItemId: string,
  ): Promise<MenuItemAddOnResponseDto> {
    return this.menusService.createMenuItemAddOn(
      menuItemId,
      createMenuItemAddOnDto,
    );
  }

  @Get('menu-items/:menuItemId/add-ons')
  @Roles({ menu: ['read'] }, 'menuItemId')
  @ApiOperation({ summary: '取得品項所有加購' })
  findAllMenuItemAddOns(
    @Param('menuItemId') menuItemId: string,
    @Query() query: AddOnPaginationQueryDto,
  ): Promise<{ data: MenuItemAddOnResponseDto[]; total: number }> {
    return this.menusService.menuItemAddOns(menuItemId, query);
  }

  @Patch('menu-items/:menuItemId/add-ons/reorder')
  @Roles({ menu: ['update'] }, 'menuItemId')
  @ApiOperation({ summary: '重新排序品項加購' })
  reorderMenuItemAddOns(
    @Body() { ids, offset }: ReorderDto,
    @Param('menuItemId') menuItemId: string,
  ): Promise<void> {
    return this.menusService.reorderMenuItemAddOns(menuItemId, ids, offset);
  }

  @Patch('menu-items/:menuItemId/add-ons/:addOnId')
  @Roles({ menu: ['update'] }, 'menuItemId')
  @ApiOperation({ summary: '更新品項加購' })
  updateMenuItemAddOn(
    @Body() updateMenuItemAddOnDto: UpdateMenuItemAddOnDto,
    @Param('addOnId') addOnId: string,
  ): Promise<MenuItemAddOnResponseDto> {
    return this.menusService.updateMenuItemAddOn(
      addOnId,
      updateMenuItemAddOnDto,
    );
  }

  @Delete('menu-items/:menuItemId/add-ons/:addOnId')
  @Roles({ menu: ['delete'] }, 'menuItemId')
  @ApiOperation({ summary: '刪除品項加購' })
  deleteMenuItemAddOn(
    @Param('addOnId') addOnId: string,
  ): Promise<MenuItemAddOnResponseDto> {
    return this.menusService.deleteMenuItemAddOn({ id: addOnId });
  }

  // ── ModifierGroup ─────────────────────────────────────────────────

  @Post('menus/:menuId/modifier-groups')
  @Roles({ menu: ['create'] }, 'menuId')
  @ApiOperation({ summary: '建立選項群組' })
  createModifierGroup(
    @Body() createModifierGroupDto: CreateModifierGroupDto,
    @Param('menuId') menuId: string,
  ): Promise<ModifierGroupResponseDto> {
    return this.menusService.createModifierGroup(
      menuId,
      createModifierGroupDto,
    );
  }

  @Get('menus/:menuId/modifier-groups')
  @Roles({ menu: ['read'] }, 'menuId')
  @ApiOperation({ summary: '取得菜單所有選項群組' })
  findAllModifierGroups(
    @Param('menuId') menuId: string,
    @Query() query: ModifierGroupPaginationQueryDto,
  ): Promise<{ data: ModifierGroupResponseDto[]; total: number }> {
    return this.menusService.modifierGroups(menuId, query);
  }

  @Patch('menus/:menuId/modifier-groups/reorder')
  @Roles({ menu: ['update'] }, 'menuId')
  @ApiOperation({ summary: '重新排序選項群組' })
  reorderModifierGroups(
    @Body() { ids, offset }: ReorderDto,
    @Param('menuId') menuId: string,
  ): Promise<void> {
    return this.menusService.reorderModifierGroups(menuId, ids, offset);
  }

  @Get('modifier-groups/:groupId')
  @Roles({ menu: ['read'] }, 'groupId')
  @ApiOperation({ summary: '取得選項群組詳情' })
  async findModifierGroup(
    @Param('groupId') groupId: string,
  ): Promise<ModifierGroupResponseDto> {
    const result = await this.menusService.modifierGroup({ id: groupId });
    if (!result) throw new NotFoundException();

    return result;
  }

  @Patch('modifier-groups/:groupId')
  @Roles({ menu: ['update'] }, 'groupId')
  @ApiOperation({ summary: '更新選項群組' })
  updateModifierGroup(
    @Body() updateModifierGroupDto: UpdateModifierGroupDto,
    @Param('groupId') groupId: string,
  ): Promise<ModifierGroupResponseDto> {
    return this.menusService.updateModifierGroup({
      where: { id: groupId },
      data: updateModifierGroupDto,
    });
  }

  @Delete('modifier-groups/:groupId')
  @Roles({ menu: ['delete'] }, 'groupId')
  @ApiOperation({ summary: '刪除選項群組' })
  deleteModifierGroup(
    @Param('groupId') groupId: string,
  ): Promise<ModifierGroupResponseDto> {
    return this.menusService.deleteModifierGroup({ id: groupId });
  }

  // ── Modifier ──────────────────────────────────────────────────────

  @Post('modifier-groups/:groupId/modifiers')
  @Roles({ menu: ['create'] }, 'groupId')
  @ApiOperation({ summary: '建立選項' })
  createModifier(
    @Body() createModifierDto: CreateModifierDto,
    @Param('groupId') groupId: string,
  ): Promise<ModifierResponseDto> {
    return this.menusService.createModifier(groupId, createModifierDto);
  }

  @Get('modifier-groups/:groupId/modifiers')
  @Roles({ menu: ['read'] }, 'groupId')
  @ApiOperation({ summary: '取得群組所有選項' })
  findAllModifiers(
    @Param('groupId') groupId: string,
    @Query() query: ModifierPaginationQueryDto,
  ): Promise<{ data: ModifierResponseDto[]; total: number }> {
    return this.menusService.modifiers(groupId, query);
  }

  @Patch('modifier-groups/:groupId/modifiers/reorder')
  @Roles({ menu: ['update'] }, 'groupId')
  @ApiOperation({ summary: '重新排序選項' })
  reorderModifiers(
    @Body() { ids, offset }: ReorderDto,
    @Param('groupId') groupId: string,
  ): Promise<void> {
    return this.menusService.reorderModifiers(groupId, ids, offset);
  }

  @Patch('modifiers/:modifierId')
  @Roles({ menu: ['update'] }, 'modifierId')
  @ApiOperation({ summary: '更新選項' })
  updateModifier(
    @Body() updateModifierDto: UpdateModifierDto,
    @Param('modifierId') modifierId: string,
  ): Promise<ModifierResponseDto> {
    return this.menusService.updateModifier({
      where: { id: modifierId },
      data: updateModifierDto,
    });
  }

  @Delete('modifiers/:modifierId')
  @Roles({ menu: ['delete'] }, 'modifierId')
  @ApiOperation({ summary: '刪除選項' })
  deleteModifier(
    @Param('modifierId') modifierId: string,
  ): Promise<ModifierResponseDto> {
    return this.menusService.deleteModifier({ id: modifierId });
  }

  // ── MenuItemModifierGroup ─────────────────────────────────────────

  @Post('menu-items/:menuItemId/modifier-groups')
  @Roles({ menu: ['create'] }, 'menuItemId')
  @ApiOperation({ summary: '為品項掛上選項群組' })
  createMenuItemModifierGroup(
    @Body() createMenuItemModifierGroupDto: CreateMenuItemModifierGroupDto,
    @Param('menuItemId') menuItemId: string,
  ): Promise<MenuItemModifierGroupResponseDto> {
    return this.menusService.createMenuItemModifierGroup(
      menuItemId,
      createMenuItemModifierGroupDto,
    );
  }

  @Get('menu-items/:menuItemId/modifier-groups')
  @Roles({ menu: ['read'] }, 'menuItemId')
  @ApiOperation({ summary: '取得品項已掛上的選項群組' })
  findAllMenuItemModifierGroups(
    @Param('menuItemId') menuItemId: string,
    @Query() query: ModifierGroupPaginationQueryDto,
  ): Promise<{ data: MenuItemModifierGroupResponseDto[]; total: number }> {
    return this.menusService.menuItemModifierGroups(menuItemId, query);
  }

  @Patch('menu-items/:menuItemId/modifier-groups/reorder')
  @Roles({ menu: ['update'] }, 'menuItemId')
  @ApiOperation({ summary: '重新排序品項的選項群組' })
  reorderMenuItemModifierGroups(
    @Body() { ids, offset }: ReorderDto,
    @Param('menuItemId') menuItemId: string,
  ): Promise<void> {
    return this.menusService.reorderMenuItemModifierGroups(
      menuItemId,
      ids,
      offset,
    );
  }

  @Delete('menu-items/:menuItemId/modifier-groups/:linkId')
  @Roles({ menu: ['delete'] }, 'menuItemId')
  @ApiOperation({ summary: '解除品項的選項群組掛載' })
  deleteMenuItemModifierGroup(
    @Param('linkId') linkId: string,
  ): Promise<MenuItemModifierGroupResponseDto> {
    return this.menusService.deleteMenuItemModifierGroup({ id: linkId });
  }
}
