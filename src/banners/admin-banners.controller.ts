import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { Audit } from '../common/decorators/audit.decorator.js';
import { IdsDto } from '../common/dto/ids.dto.js';
import { AdminGuard } from '../common/guards/admin.guard.js';

import { BannersService } from './banners.service.js';
import { BannerPaginationQueryDto } from './dto/banner-pagination-query.dto.js';
import {
  BannerListResponseDto,
  BannerResponseDto,
} from './dto/banner-response.dto.js';
import { CreateBannerDto, UpdateBannerDto } from './dto/create-banner.dto.js';
import { ReorderBannersDto } from './dto/reorder-banners.dto.js';

@ApiTags('banners')
@UseGuards(AdminGuard)
@Controller('banners')
export class AdminBannersController {
  constructor(private readonly bannersService: BannersService) {}

  @Post()
  @Audit('banner', { response: true })
  @ApiOperation({ summary: '建立輪播圖' })
  create(@Body() dto: CreateBannerDto): Promise<BannerResponseDto> {
    return this.bannersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '查詢輪播圖列表' })
  @ApiOkResponse({ type: BannerListResponseDto })
  findAll(
    @Query() query: BannerPaginationQueryDto,
  ): Promise<BannerListResponseDto> {
    return this.bannersService.findAll(query);
  }

  @Patch('reorder')
  @Audit('banner', { body: 'ids' })
  @ApiOperation({ summary: '重新排序輪播圖' })
  reorder(@Body() { ids, offset }: ReorderBannersDto): Promise<void> {
    return this.bannersService.reorder(ids, offset);
  }

  @Delete()
  @Audit('banner', { body: 'ids' })
  @ApiOperation({ summary: '批次刪除輪播圖' })
  removeMany(@Body() { ids }: IdsDto): Promise<void> {
    return this.bannersService.removeMany(ids);
  }

  @Patch(':bannerId')
  @Audit('banner', { param: 'bannerId' })
  @ApiOperation({ summary: '更新輪播圖' })
  update(
    @Param('bannerId') bannerId: string,
    @Body() dto: UpdateBannerDto,
  ): Promise<BannerResponseDto> {
    return this.bannersService.update(bannerId, dto);
  }

  @Delete(':bannerId')
  @Audit('banner', { param: 'bannerId' })
  @ApiOperation({ summary: '刪除輪播圖' })
  remove(@Param('bannerId') bannerId: string): Promise<void> {
    return this.bannersService.remove(bannerId);
  }
}
