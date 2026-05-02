import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CreateMenuDto } from './dto/create-menu.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { CreateMenuItemAddOnDto } from './dto/create-menu-item-add-on.dto';
import { CreateMenuSectionDto } from './dto/create-menu-section.dto';
import { CreateOfferDto } from './dto/create-offer.dto';
import { MenuItemAddOnResponseDto } from './dto/menu-item-add-on-response.dto';
import { MenuItemResponseDto } from './dto/menu-item-response.dto';
import { MenuResponseDto } from './dto/menu-response.dto';
import { MenuSectionResponseDto } from './dto/menu-section-response.dto';
import { OfferResponseDto } from './dto/offer-response.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { UpdateMenuSectionDto } from './dto/update-menu-section.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { MenusService } from './menus.service';

@ApiTags('menus')
@Controller()
export class MenusController {
  constructor(private readonly menusService: MenusService) {}

  // ── Menu ──────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @Post('organizations/:organizationId/menus')
  @ApiOperation({ summary: '建立菜單' })
  createMenu(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateMenuDto,
  ): Promise<MenuResponseDto> {
    return this.menusService.createMenu(organizationId, dto);
  }

  @ApiBearerAuth()
  @Get('organizations/:organizationId/menus')
  @ApiOperation({ summary: '取得組織所有菜單' })
  findAllMenus(
    @Param('organizationId') organizationId: string,
  ): Promise<MenuResponseDto[]> {
    return this.menusService.menus(organizationId);
  }

  @ApiBearerAuth()
  @Get('menus/:id')
  @ApiOperation({ summary: '取得菜單詳情' })
  async findMenu(@Param('id') id: string): Promise<MenuResponseDto> {
    const result = await this.menusService.menu({ id });
    if (!result) throw new NotFoundException();
    return result;
  }

  @ApiBearerAuth()
  @Patch('menus/:id')
  @ApiOperation({ summary: '更新菜單' })
  updateMenu(
    @Param('id') id: string,
    @Body() dto: UpdateMenuDto,
  ): Promise<MenuResponseDto> {
    return this.menusService.updateMenu({ where: { id }, data: dto });
  }

  @ApiBearerAuth()
  @Delete('menus/:id')
  @ApiOperation({ summary: '刪除菜單' })
  deleteMenu(@Param('id') id: string): Promise<MenuResponseDto> {
    return this.menusService.deleteMenu({ id });
  }

  // ── MenuSection ───────────────────────────────────────────────────

  @ApiBearerAuth()
  @Post('menus/:menuId/sections')
  @ApiOperation({ summary: '建立菜單分類' })
  createMenuSection(
    @Param('menuId') menuId: string,
    @Body() dto: CreateMenuSectionDto,
  ): Promise<MenuSectionResponseDto> {
    return this.menusService.createMenuSection(menuId, dto);
  }

  @ApiBearerAuth()
  @Get('menu-sections/:id')
  @ApiOperation({ summary: '取得菜單分類詳情' })
  async findMenuSection(
    @Param('id') id: string,
  ): Promise<MenuSectionResponseDto> {
    const result = await this.menusService.menuSection({ id });
    if (!result) throw new NotFoundException();
    return result;
  }

  @ApiBearerAuth()
  @Patch('menu-sections/:id')
  @ApiOperation({ summary: '更新菜單分類' })
  updateMenuSection(
    @Param('id') id: string,
    @Body() dto: UpdateMenuSectionDto,
  ): Promise<MenuSectionResponseDto> {
    return this.menusService.updateMenuSection({ where: { id }, data: dto });
  }

  @ApiBearerAuth()
  @Delete('menu-sections/:id')
  @ApiOperation({ summary: '刪除菜單分類' })
  deleteMenuSection(@Param('id') id: string): Promise<MenuSectionResponseDto> {
    return this.menusService.deleteMenuSection({ id });
  }

  // ── MenuItem ──────────────────────────────────────────────────────

  @ApiBearerAuth()
  @Post('menu-items')
  @ApiOperation({ summary: '建立菜單品項' })
  createMenuItem(@Body() dto: CreateMenuItemDto): Promise<MenuItemResponseDto> {
    return this.menusService.createMenuItem(dto);
  }

  @ApiBearerAuth()
  @Get('menu-items/:id')
  @ApiOperation({ summary: '取得菜單品項詳情' })
  async findMenuItem(@Param('id') id: string): Promise<MenuItemResponseDto> {
    const result = await this.menusService.menuItem({ id });
    if (!result) throw new NotFoundException();
    return result;
  }

  @ApiBearerAuth()
  @Patch('menu-items/:id')
  @ApiOperation({ summary: '更新菜單品項' })
  updateMenuItem(
    @Param('id') id: string,
    @Body() dto: UpdateMenuItemDto,
  ): Promise<MenuItemResponseDto> {
    return this.menusService.updateMenuItem({ where: { id }, data: dto });
  }

  @ApiBearerAuth()
  @Delete('menu-items/:id')
  @ApiOperation({ summary: '刪除菜單品項' })
  deleteMenuItem(@Param('id') id: string): Promise<MenuItemResponseDto> {
    return this.menusService.deleteMenuItem({ id });
  }

  // ── Offer ─────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @Post('offers')
  @ApiOperation({ summary: '建立報價' })
  createOffer(@Body() dto: CreateOfferDto): Promise<OfferResponseDto> {
    return this.menusService.createOffer(dto);
  }

  @ApiBearerAuth()
  @Get('offers/:id')
  @ApiOperation({ summary: '取得報價詳情' })
  async findOffer(@Param('id') id: string): Promise<OfferResponseDto> {
    const result = await this.menusService.offer({ id });
    if (!result) throw new NotFoundException();
    return result;
  }

  @ApiBearerAuth()
  @Patch('offers/:id')
  @ApiOperation({ summary: '更新報價' })
  updateOffer(
    @Param('id') id: string,
    @Body() dto: UpdateOfferDto,
  ): Promise<OfferResponseDto> {
    return this.menusService.updateOffer({ where: { id }, data: dto });
  }

  @ApiBearerAuth()
  @Delete('offers/:id')
  @ApiOperation({ summary: '刪除報價' })
  deleteOffer(@Param('id') id: string): Promise<OfferResponseDto> {
    return this.menusService.deleteOffer({ id });
  }

  // ── MenuItemAddOn ─────────────────────────────────────────────────

  @ApiBearerAuth()
  @Post('menu-items/:itemId/add-ons')
  @ApiOperation({ summary: '新增品項附加選項' })
  createMenuItemAddOn(
    @Param('itemId') itemId: string,
    @Body() dto: CreateMenuItemAddOnDto,
  ): Promise<MenuItemAddOnResponseDto> {
    return this.menusService.createMenuItemAddOn(itemId, dto);
  }

  @ApiBearerAuth()
  @Delete('menu-item-add-ons/:id')
  @ApiOperation({ summary: '刪除品項附加選項' })
  deleteMenuItemAddOn(
    @Param('id') id: string,
  ): Promise<MenuItemAddOnResponseDto> {
    return this.menusService.deleteMenuItemAddOn({ id });
  }
}
