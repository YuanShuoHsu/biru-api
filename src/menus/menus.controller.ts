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

import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { CreateMenuSectionDto } from './dto/create-menu-section.dto';
import { CreateMenuDto } from './dto/create-menu.dto';
import { MenuItemResponseDto } from './dto/menu-item-response.dto';
import { MenuResponseDto } from './dto/menu-response.dto';
import { MenuSectionResponseDto } from './dto/menu-section-response.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import { UpdateMenuSectionDto } from './dto/update-menu-section.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
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
  @Get('menus/:menuId')
  @ApiOperation({ summary: '取得菜單詳情' })
  async findMenu(@Param('menuId') menuId: string): Promise<MenuResponseDto> {
    const result = await this.menusService.menu({ id: menuId });
    if (!result) throw new NotFoundException();

    return result;
  }

  @ApiBearerAuth()
  @Patch('menus/:menuId')
  @ApiOperation({ summary: '更新菜單' })
  updateMenu(
    @Param('menuId') menuId: string,
    @Body() dto: UpdateMenuDto,
  ): Promise<MenuResponseDto> {
    return this.menusService.updateMenu({ where: { id: menuId }, data: dto });
  }

  @ApiBearerAuth()
  @Delete('menus/:menuId')
  @ApiOperation({ summary: '刪除菜單' })
  deleteMenu(@Param('menuId') menuId: string): Promise<MenuResponseDto> {
    return this.menusService.deleteMenu({ id: menuId });
  }

  // ── MenuSection ───────────────────────────────────────────────────

  @ApiBearerAuth()
  @Post('menus/:menuId/menu-sections')
  @ApiOperation({ summary: '建立菜單分類' })
  createMenuSection(
    @Param('menuId') menuId: string,
    @Body() dto: CreateMenuSectionDto,
  ): Promise<MenuSectionResponseDto> {
    return this.menusService.createMenuSection(menuId, dto);
  }

  @ApiBearerAuth()
  @Get('menus/:menuId/menu-sections')
  @ApiOperation({ summary: '取得菜單所有分類' })
  findAllMenuSections(
    @Param('menuId') menuId: string,
  ): Promise<MenuSectionResponseDto[]> {
    return this.menusService.menuSections(menuId);
  }

  @ApiBearerAuth()
  @Get('menu-sections/:sectionId')
  @ApiOperation({ summary: '取得菜單分類詳情' })
  async findMenuSection(
    @Param('sectionId') sectionId: string,
  ): Promise<MenuSectionResponseDto> {
    const result = await this.menusService.menuSection({ id: sectionId });
    if (!result) throw new NotFoundException();

    return result;
  }

  @ApiBearerAuth()
  @Patch('menu-sections/:sectionId')
  @ApiOperation({ summary: '更新菜單分類' })
  updateMenuSection(
    @Param('sectionId') sectionId: string,
    @Body() dto: UpdateMenuSectionDto,
  ): Promise<MenuSectionResponseDto> {
    return this.menusService.updateMenuSection({
      where: { id: sectionId },
      data: dto,
    });
  }

  @ApiBearerAuth()
  @Delete('menu-sections/:sectionId')
  @ApiOperation({ summary: '刪除菜單分類' })
  deleteMenuSection(
    @Param('sectionId') sectionId: string,
  ): Promise<MenuSectionResponseDto> {
    return this.menusService.deleteMenuSection({ id: sectionId });
  }

  // ── MenuItem ──────────────────────────────────────────────────────

  @ApiBearerAuth()
  @Post('menu-sections/:sectionId/menu-items')
  @ApiOperation({ summary: '建立菜單品項' })
  createMenuItem(
    @Param('sectionId') sectionId: string,
    @Body() dto: CreateMenuItemDto,
  ): Promise<MenuItemResponseDto> {
    return this.menusService.createMenuItem(sectionId, dto);
  }

  @ApiBearerAuth()
  @Get('menu-sections/:sectionId/menu-items')
  @ApiOperation({ summary: '取得分類所有品項' })
  findAllMenuSectionItems(
    @Param('sectionId') sectionId: string,
  ): Promise<MenuItemResponseDto[]> {
    return this.menusService.menuSectionItems(sectionId);
  }

  @ApiBearerAuth()
  @Patch('menu-items/:menuItemId')
  @ApiOperation({ summary: '更新菜單品項' })
  updateMenuItem(
    @Param('menuItemId') menuItemId: string,
    @Body() dto: UpdateMenuItemDto,
  ): Promise<MenuItemResponseDto> {
    return this.menusService.updateMenuItem({
      where: { id: menuItemId },
      data: dto,
    });
  }

  @ApiBearerAuth()
  @Delete('menu-items/:menuItemId')
  @ApiOperation({ summary: '刪除菜單品項' })
  deleteMenuItem(
    @Param('menuItemId') menuItemId: string,
  ): Promise<MenuItemResponseDto> {
    return this.menusService.deleteMenuItem({ id: menuItemId });
  }
}
