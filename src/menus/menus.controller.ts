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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from './decorators/roles.decorator';
import { CreateMenuItemAddOnDto } from './dto/create-menu-item-add-on.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { CreateMenuSectionDto } from './dto/create-menu-section.dto';
import { CreateMenuDto } from './dto/create-menu.dto';
import { CreateOfferDto } from './dto/create-offer.dto';
import { MenuItemAddOnResponseDto } from './dto/menu-item-add-on-response.dto';
import { MenuItemResponseDto } from './dto/menu-item-response.dto';
import { MenuResponseDto } from './dto/menu-response.dto';
import { MenuSectionResponseDto } from './dto/menu-section-response.dto';
import { OfferResponseDto } from './dto/offer-response.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { ReorderDto } from './dto/reorder.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { UpdateMenuSectionDto } from './dto/update-menu-section.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { MenusService } from './menus.service';

@ApiTags('menus')
@ApiBearerAuth()
@Controller()
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  // ── Menu ──────────────────────────────────────────────────────────

  @Post('organizations/:organizationId/menus')
  @Roles({ menu: ['create'] }, 'organizationId')
  @ApiOperation({ summary: '建立菜單' })
  createMenu(
    @Body() createMenuDto: CreateMenuDto,
    @Param('organizationId') organizationId: string,
  ): Promise<MenuResponseDto> {
    return this.menusService.createMenu(organizationId, createMenuDto);
  }

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

  @Delete('menus/:menuId')
  @Roles({ menu: ['delete'] }, 'menuId')
  @ApiOperation({ summary: '刪除菜單' })
  deleteMenu(@Param('menuId') menuId: string): Promise<MenuResponseDto> {
    return this.menusService.deleteMenu({ id: menuId });
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
    @Query() query: PaginationQueryDto,
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
    @Query() query: PaginationQueryDto,
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
  ): Promise<MenuItemAddOnResponseDto[]> {
    return this.menusService.menuItemAddOns(menuItemId);
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

  @Delete('menu-item-add-ons/:addOnId')
  @Roles({ menu: ['delete'] }, 'addOnId')
  @ApiOperation({ summary: '刪除品項加購' })
  deleteMenuItemAddOn(
    @Param('addOnId') addOnId: string,
  ): Promise<MenuItemAddOnResponseDto> {
    return this.menusService.deleteMenuItemAddOn({ id: addOnId });
  }
}
