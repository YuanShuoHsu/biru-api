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
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Audit } from '../common/decorators/audit.decorator.js';
import { IdsDto } from '../common/dto/ids.dto.js';
import { OrderTicketPrinterOptionDto } from '../orders/dto/order-ticket.dto.js';

import { OrganizationId } from './decorators/organization-id.decorator.js';
import { HasPermission } from './decorators/permission.decorator.js';
import { Roles } from './decorators/roles.decorator.js';
import { AddOnPaginationQueryDto } from './dto/add-on-pagination-query.dto.js';
import { CreateMenuItemAddOnDto } from './dto/create-menu-item-add-on.dto.js';
import { CreateMenuItemModifierGroupDto } from './dto/create-menu-item-modifier-group.dto.js';
import { CreateMenuItemDto } from './dto/create-menu-item.dto.js';
import { CreateMenuSectionDto } from './dto/create-menu-section.dto.js';
import { CreateModifierGroupDto } from './dto/create-modifier-group.dto.js';
import { CreateModifierDto } from './dto/create-modifier.dto.js';
import { CreateOfferDto } from './dto/create-offer.dto.js';
import {
  MenuItemAddOnListResponseDto,
  MenuItemAddOnResponseDto,
} from './dto/menu-item-add-on-response.dto.js';
import {
  MenuItemModifierGroupListResponseDto,
  MenuItemModifierGroupResponseDto,
} from './dto/menu-item-modifier-group-response.dto.js';
import { MenuItemPaginationQueryDto } from './dto/menu-item-pagination-query.dto.js';
import {
  MenuItemListResponseDto,
  MenuItemResponseDto,
} from './dto/menu-item-response.dto.js';
import { MenuResponseDto } from './dto/menu-response.dto.js';
import { MenuSectionPaginationQueryDto } from './dto/menu-section-pagination-query.dto.js';
import {
  MenuSectionListResponseDto,
  MenuSectionResponseDto,
} from './dto/menu-section-response.dto.js';
import { ModifierGroupPaginationQueryDto } from './dto/modifier-group-pagination-query.dto.js';
import {
  ModifierGroupListResponseDto,
  ModifierGroupResponseDto,
} from './dto/modifier-group-response.dto.js';
import { ModifierPaginationQueryDto } from './dto/modifier-pagination-query.dto.js';
import {
  ModifierListResponseDto,
  ModifierResponseDto,
} from './dto/modifier-response.dto.js';
import { OfferResponseDto } from './dto/offer-response.dto.js';
import { ReorderDto } from './dto/reorder.dto.js';
import { UpdateItemAvailabilityDto } from './dto/update-item-availability.dto.js';
import { UpdateOfferAvailabilityDto } from './dto/update-offer-availability.dto.js';
import { UpdateMenuItemAddOnDto } from './dto/update-menu-item-add-on.dto.js';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto.js';
import { UpdateMenuSectionDto } from './dto/update-menu-section.dto.js';
import { UpdateMenuDto } from './dto/update-menu.dto.js';
import { UpdateModifierGroupDto } from './dto/update-modifier-group.dto.js';
import { UpdateModifierDto } from './dto/update-modifier.dto.js';
import { UpdateOfferDto } from './dto/update-offer.dto.js';
import { MenuEventsInterceptor } from './interceptors/menu-events.interceptor.js';
import { MenusService } from './menus.service.js';

@ApiTags('menus')
@ApiBearerAuth()
@Controller()
@UseInterceptors(MenuEventsInterceptor)
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

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
  @Audit('menu', { param: 'menuId' })
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

  @Post('menus/:menuId/menu-sections')
  @Roles({ menu: ['create'] }, 'menuId')
  @Audit('menuSection', { response: true })
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
  @ApiOkResponse({ type: MenuSectionListResponseDto })
  findAllMenuSections(
    @Param('menuId') menuId: string,
    @Query() query: MenuSectionPaginationQueryDto,
  ): Promise<MenuSectionListResponseDto> {
    return this.menusService.menuSections(menuId, query);
  }

  @Get('menus/:menuId/order-ticket-printers')
  @Roles({ menu: ['read'] }, 'menuId')
  @ApiOperation({ summary: '分類與品項可指定的工作單印表機' })
  findOrderTicketPrinters(
    @Param('menuId') menuId: string,
  ): Promise<OrderTicketPrinterOptionDto[]> {
    return this.menusService.orderTicketPrinters(menuId);
  }

  @Patch('menus/:menuId/menu-sections/reorder')
  @Roles({ menu: ['update'] }, 'menuId')
  @Audit('menuSection', { body: 'ids' })
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
  @Audit('menuSection', { param: 'sectionId' })
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

  @Delete('menus/:menuId/menu-sections')
  @Roles({ menu: ['delete'] }, 'menuId')
  @Audit('menuSection', { body: 'ids' })
  @ApiOperation({ summary: '批次刪除菜單分類' })
  deleteMenuSections(
    @Param('menuId') menuId: string,
    @Body() { ids }: IdsDto,
  ): Promise<void> {
    return this.menusService.deleteMenuSections(menuId, ids);
  }

  @Delete('menu-sections/:sectionId')
  @Roles({ menu: ['delete'] }, 'sectionId')
  @Audit('menuSection', { param: 'sectionId' })
  @ApiOperation({ summary: '刪除菜單分類' })
  deleteMenuSection(
    @Param('sectionId') sectionId: string,
  ): Promise<MenuSectionResponseDto> {
    return this.menusService.deleteMenuSection({ id: sectionId });
  }

  @Post('menu-sections/:sectionId/menu-items')
  @Roles({ menu: ['create'] }, 'sectionId')
  // 同一支端點會一併寫入 offer（價格與供應狀態）
  @Audit(
    { resource: 'menuItem', idSource: { response: true } },
    {
      resource: 'menuItem',
      idSource: { column: 'menuItemId', response: true },
      via: { table: 'offer', ownerColumn: 'menuItemId' },
    },
  )
  @ApiOperation({ summary: '建立菜單品項' })
  createMenuItem(
    @Body() createMenuItemDto: CreateMenuItemDto,
    @Param('sectionId') sectionId: string,
    @OrganizationId() organizationId: string,
  ): Promise<MenuItemResponseDto> {
    return this.menusService.createMenuItem(
      sectionId,
      organizationId,
      createMenuItemDto,
    );
  }

  @Get('menu-sections/:sectionId/menu-items')
  @Roles({ menu: ['read'] }, 'sectionId')
  @ApiOperation({ summary: '取得分類所有品項' })
  @ApiOkResponse({ type: MenuItemListResponseDto })
  findAllMenuSectionItems(
    @Param('sectionId') sectionId: string,
    @Query() query: MenuItemPaginationQueryDto,
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
    @OrganizationId() organizationId: string,
  ): Promise<MenuItemListResponseDto> {
    return this.menusService.menuSectionItems(
      sectionId,
      organizationId,
      query,
      canReadPurchasing,
    );
  }

  @Patch('menu-sections/:sectionId/menu-items/reorder')
  @Roles({ menu: ['update'] }, 'sectionId')
  @Audit('menuItem', { body: 'ids' })
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
    @HasPermission({ purchasing: ['read'] }) canReadPurchasing: boolean,
    @OrganizationId() organizationId: string,
  ): Promise<MenuItemResponseDto> {
    const result = await this.menusService.menuItem(
      { id: menuItemId },
      organizationId,
      canReadPurchasing,
    );
    if (!result) throw new NotFoundException();

    return result;
  }

  @Patch('menu-items/:menuItemId')
  @Roles({ menu: ['update'] }, 'menuItemId')
  // 同一支端點會一併寫入 offer（價格與供應狀態）
  @Audit(
    { resource: 'menuItem', idSource: { param: 'menuItemId' } },
    {
      resource: 'menuItem',
      idSource: { column: 'menuItemId', param: 'menuItemId' },
      via: { table: 'offer', ownerColumn: 'menuItemId' },
    },
  )
  @ApiOperation({ summary: '更新菜單品項' })
  updateMenuItem(
    @Body() updateMenuItemDto: UpdateMenuItemDto,
    @Param('menuItemId') menuItemId: string,
    @OrganizationId() organizationId: string,
  ): Promise<MenuItemResponseDto> {
    return this.menusService.updateMenuItem({
      where: { id: menuItemId },
      organizationId,
      data: updateMenuItemDto,
    });
  }

  @Delete('menu-sections/:sectionId/menu-items')
  @Roles({ menu: ['delete'] }, 'sectionId')
  @Audit('menuItem', { body: 'ids' })
  @ApiOperation({ summary: '批次刪除品項' })
  deleteMenuItems(
    @Param('sectionId') sectionId: string,
    @Body() { ids }: IdsDto,
  ): Promise<void> {
    return this.menusService.deleteMenuItems(sectionId, ids);
  }

  @Delete('menu-items/:menuItemId')
  @Roles({ menu: ['delete'] }, 'menuItemId')
  @Audit('menuItem', { param: 'menuItemId' })
  @ApiOperation({ summary: '刪除菜單品項' })
  deleteMenuItem(
    @Param('menuItemId') menuItemId: string,
  ): Promise<MenuItemResponseDto> {
    return this.menusService.deleteMenuItem({ id: menuItemId });
  }

  @Post('menu-items/:menuItemId/offers')
  @Roles({ menu: ['create'] }, 'menuItemId')
  @Audit({
    resource: 'menuItem',
    idSource: { column: 'menuItemId', param: 'menuItemId' },
    via: { table: 'offer', ownerColumn: 'menuItemId' },
  })
  @ApiOperation({ summary: '建立品項定價' })
  createOffer(
    @Body() createOfferDto: CreateOfferDto,
    @Param('menuItemId') menuItemId: string,
    @OrganizationId() organizationId: string,
  ): Promise<OfferResponseDto> {
    return this.menusService.createOffer(
      menuItemId,
      organizationId,
      createOfferDto,
    );
  }

  @Get('menu-items/:menuItemId/offers')
  @Roles({ menu: ['read'] }, 'menuItemId')
  @ApiOperation({ summary: '取得品項所有定價' })
  findAllOffers(
    @Param('menuItemId') menuItemId: string,
    @OrganizationId() organizationId: string,
  ): Promise<OfferResponseDto[]> {
    return this.menusService.menuItemOffers(menuItemId, organizationId);
  }

  @Patch('offers/:offerId')
  @Roles({ menu: ['update'] }, 'offerId')
  @Audit({
    resource: 'menuItem',
    idSource: { param: 'offerId' },
    via: { table: 'offer', ownerColumn: 'menuItemId' },
  })
  @ApiOperation({ summary: '更新品項定價' })
  updateOffer(
    @Body() updateOfferDto: UpdateOfferDto,
    @Param('offerId') offerId: string,
    @OrganizationId() organizationId: string,
  ): Promise<OfferResponseDto> {
    return this.menusService.updateOffer({
      where: { id: offerId },
      organizationId,
      data: updateOfferDto,
    });
  }

  @Patch('offers/:offerId/availability')
  @Roles({ itemAvailability: ['update'] }, 'offerId')
  @Audit({
    resource: 'menuItem',
    idSource: { param: 'offerId' },
    via: { table: 'offer', ownerColumn: 'menuItemId' },
  })
  @ApiOperation({ summary: '更新品項供應狀態與剩餘數量' })
  updateOfferAvailability(
    @Body() updateOfferAvailabilityDto: UpdateOfferAvailabilityDto,
    @Param('offerId') offerId: string,
    @OrganizationId() organizationId: string,
  ): Promise<OfferResponseDto> {
    return this.menusService.updateOfferAvailability({
      where: { id: offerId },
      organizationId,
      data: updateOfferAvailabilityDto,
    });
  }

  @Delete('offers/:offerId')
  @Roles({ menu: ['delete'] }, 'offerId')
  @Audit({
    resource: 'menuItem',
    idSource: { param: 'offerId' },
    via: { table: 'offer', ownerColumn: 'menuItemId' },
  })
  @ApiOperation({ summary: '刪除品項定價' })
  deleteOffer(
    @Param('offerId') offerId: string,
    @OrganizationId() organizationId: string,
  ): Promise<OfferResponseDto> {
    return this.menusService.deleteOffer({ id: offerId, organizationId });
  }

  @Post('menu-items/:menuItemId/add-ons')
  @Roles({ menu: ['create'] }, 'menuItemId')
  @Audit('menuItemAddOn', { response: true })
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
  @ApiOkResponse({ type: MenuItemAddOnListResponseDto })
  findAllMenuItemAddOns(
    @Param('menuItemId') menuItemId: string,
    @Query() query: AddOnPaginationQueryDto,
  ): Promise<MenuItemAddOnListResponseDto> {
    return this.menusService.menuItemAddOns(menuItemId, query);
  }

  @Patch('menu-items/:menuItemId/add-ons/reorder')
  @Roles({ menu: ['update'] }, 'menuItemId')
  @Audit('menuItemAddOn', { body: 'ids' })
  @ApiOperation({ summary: '重新排序品項加購' })
  reorderMenuItemAddOns(
    @Body() { ids, offset }: ReorderDto,
    @Param('menuItemId') menuItemId: string,
  ): Promise<void> {
    return this.menusService.reorderMenuItemAddOns(menuItemId, ids, offset);
  }

  @Patch('menu-items/:menuItemId/add-ons/:addOnId')
  @Roles({ menu: ['update'] }, 'menuItemId')
  @Audit('menuItemAddOn', { param: 'addOnId' })
  @ApiOperation({ summary: '更新品項加購' })
  updateMenuItemAddOn(
    @Body() updateMenuItemAddOnDto: UpdateMenuItemAddOnDto,
    @Param('menuItemId') menuItemId: string,
    @Param('addOnId') addOnId: string,
  ): Promise<MenuItemAddOnResponseDto> {
    return this.menusService.updateMenuItemAddOn(
      { id: addOnId, menuItemId },
      updateMenuItemAddOnDto,
    );
  }

  @Delete('menu-items/:menuItemId/add-ons')
  @Roles({ menu: ['delete'] }, 'menuItemId')
  @Audit('menuItemAddOn', { body: 'ids' })
  @ApiOperation({ summary: '批次刪除品項加購' })
  deleteMenuItemAddOns(
    @Param('menuItemId') menuItemId: string,
    @Body() { ids }: IdsDto,
  ): Promise<void> {
    return this.menusService.deleteMenuItemAddOns(menuItemId, ids);
  }

  @Delete('menu-items/:menuItemId/add-ons/:addOnId')
  @Roles({ menu: ['delete'] }, 'menuItemId')
  @Audit('menuItemAddOn', { param: 'addOnId' })
  @ApiOperation({ summary: '刪除品項加購' })
  deleteMenuItemAddOn(
    @Param('menuItemId') menuItemId: string,
    @Param('addOnId') addOnId: string,
  ): Promise<MenuItemAddOnResponseDto> {
    return this.menusService.deleteMenuItemAddOn({ id: addOnId, menuItemId });
  }

  @Post('menus/:menuId/modifier-groups')
  @Roles({ menu: ['create'] }, 'menuId')
  @Audit('modifierGroup', { response: true })
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
  @ApiOkResponse({ type: ModifierGroupListResponseDto })
  findAllModifierGroups(
    @Param('menuId') menuId: string,
    @Query() query: ModifierGroupPaginationQueryDto,
  ): Promise<ModifierGroupListResponseDto> {
    return this.menusService.modifierGroups(menuId, query);
  }

  @Patch('menus/:menuId/modifier-groups/reorder')
  @Roles({ menu: ['update'] }, 'menuId')
  @Audit('modifierGroup', { body: 'ids' })
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
  @Audit('modifierGroup', { param: 'groupId' })
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

  @Delete('menus/:menuId/modifier-groups')
  @Roles({ menu: ['delete'] }, 'menuId')
  @Audit('modifierGroup', { body: 'ids' })
  @ApiOperation({ summary: '批次刪除選項群組' })
  deleteModifierGroups(
    @Param('menuId') menuId: string,
    @Body() { ids }: IdsDto,
  ): Promise<void> {
    return this.menusService.deleteModifierGroups(menuId, ids);
  }

  @Delete('modifier-groups/:groupId')
  @Roles({ menu: ['delete'] }, 'groupId')
  @Audit('modifierGroup', { param: 'groupId' })
  @ApiOperation({ summary: '刪除選項群組' })
  deleteModifierGroup(
    @Param('groupId') groupId: string,
  ): Promise<ModifierGroupResponseDto> {
    return this.menusService.deleteModifierGroup({ id: groupId });
  }

  @Post('modifier-groups/:groupId/modifiers')
  @Roles({ menu: ['create'] }, 'groupId')
  @Audit('modifier', { response: true })
  @ApiOperation({ summary: '建立選項' })
  createModifier(
    @Body() createModifierDto: CreateModifierDto,
    @Param('groupId') groupId: string,
    @OrganizationId() organizationId: string,
  ): Promise<ModifierResponseDto> {
    return this.menusService.createModifier(
      groupId,
      organizationId,
      createModifierDto,
    );
  }

  @Get('modifier-groups/:groupId/modifiers')
  @Roles({ menu: ['read'] }, 'groupId')
  @ApiOperation({ summary: '取得群組所有選項' })
  @ApiOkResponse({ type: ModifierListResponseDto })
  findAllModifiers(
    @Param('groupId') groupId: string,
    @Query() query: ModifierPaginationQueryDto,
    @OrganizationId() organizationId: string,
  ): Promise<ModifierListResponseDto> {
    return this.menusService.modifiers(groupId, organizationId, query);
  }

  @Patch('modifier-groups/:groupId/modifiers/reorder')
  @Roles({ menu: ['update'] }, 'groupId')
  @Audit('modifier', { body: 'ids' })
  @ApiOperation({ summary: '重新排序選項' })
  reorderModifiers(
    @Body() { ids, offset }: ReorderDto,
    @Param('groupId') groupId: string,
  ): Promise<void> {
    return this.menusService.reorderModifiers(groupId, ids, offset);
  }

  @Patch('modifiers/:modifierId')
  @Roles({ menu: ['update'] }, 'modifierId')
  @Audit('modifier', { param: 'modifierId' })
  @ApiOperation({ summary: '更新選項' })
  updateModifier(
    @Body() updateModifierDto: UpdateModifierDto,
    @Param('modifierId') modifierId: string,
    @OrganizationId() organizationId: string,
  ): Promise<ModifierResponseDto> {
    return this.menusService.updateModifier({
      where: { id: modifierId },
      organizationId,
      data: updateModifierDto,
    });
  }

  @Patch('modifiers/:modifierId/availability')
  @Roles({ itemAvailability: ['update'] }, 'modifierId')
  @Audit('modifier', { param: 'modifierId' })
  @ApiOperation({ summary: '更新選項供應狀態' })
  updateModifierAvailability(
    @Body() updateItemAvailabilityDto: UpdateItemAvailabilityDto,
    @Param('modifierId') modifierId: string,
    @OrganizationId() organizationId: string,
  ): Promise<ModifierResponseDto> {
    return this.menusService.updateModifier({
      where: { id: modifierId },
      organizationId,
      data: updateItemAvailabilityDto,
    });
  }

  @Delete('modifier-groups/:groupId/modifiers')
  @Roles({ menu: ['delete'] }, 'groupId')
  @Audit('modifier', { body: 'ids' })
  @ApiOperation({ summary: '批次刪除選項' })
  deleteModifiers(
    @Param('groupId') groupId: string,
    @Body() { ids }: IdsDto,
  ): Promise<void> {
    return this.menusService.deleteModifiers(groupId, ids);
  }

  @Delete('modifiers/:modifierId')
  @Roles({ menu: ['delete'] }, 'modifierId')
  @Audit('modifier', { param: 'modifierId' })
  @ApiOperation({ summary: '刪除選項' })
  deleteModifier(
    @Param('modifierId') modifierId: string,
    @OrganizationId() organizationId: string,
  ): Promise<ModifierResponseDto> {
    return this.menusService.deleteModifier({ id: modifierId, organizationId });
  }

  @Post('menu-items/:menuItemId/modifier-groups')
  @Roles({ menu: ['create'] }, 'menuItemId')
  @Audit('menuItemModifierGroup', { response: true })
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
  @ApiOkResponse({ type: MenuItemModifierGroupListResponseDto })
  findAllMenuItemModifierGroups(
    @Param('menuItemId') menuItemId: string,
    @Query() query: ModifierGroupPaginationQueryDto,
  ): Promise<MenuItemModifierGroupListResponseDto> {
    return this.menusService.menuItemModifierGroups(menuItemId, query);
  }

  @Patch('menu-items/:menuItemId/modifier-groups/reorder')
  @Roles({ menu: ['update'] }, 'menuItemId')
  @Audit('menuItemModifierGroup', { body: 'ids' })
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

  @Delete('menu-items/:menuItemId/modifier-groups')
  @Roles({ menu: ['delete'] }, 'menuItemId')
  @Audit('menuItemModifierGroup', { body: 'ids' })
  @ApiOperation({ summary: '批次解除品項的選項群組掛載' })
  deleteMenuItemModifierGroups(
    @Param('menuItemId') menuItemId: string,
    @Body() { ids }: IdsDto,
  ): Promise<void> {
    return this.menusService.deleteMenuItemModifierGroups(menuItemId, ids);
  }

  @Delete('menu-items/:menuItemId/modifier-groups/:linkId')
  @Roles({ menu: ['delete'] }, 'menuItemId')
  @Audit('menuItemModifierGroup', { param: 'linkId' })
  @ApiOperation({ summary: '解除品項的選項群組掛載' })
  deleteMenuItemModifierGroup(
    @Param('menuItemId') menuItemId: string,
    @Param('linkId') linkId: string,
  ): Promise<MenuItemModifierGroupResponseDto> {
    return this.menusService.deleteMenuItemModifierGroup({
      id: linkId,
      menuItemId,
    });
  }
}
