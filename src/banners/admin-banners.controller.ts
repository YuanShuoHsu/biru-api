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
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminGuard } from 'src/common/guards/admin.guard';

import { BannersService } from './banners.service';
import { BannerPaginationQueryDto } from './dto/banner-pagination-query.dto';
import { BannerResponseDto } from './dto/banner-response.dto';
import { CreateBannerDto, UpdateBannerDto } from './dto/create-banner.dto';
import { ReorderBannersDto } from './dto/reorder-banners.dto';

@ApiTags('banners')
@UseGuards(AdminGuard)
@Controller('banners')
export class AdminBannersController {
  constructor(private readonly bannersService: BannersService) {}

  @Post()
  @ApiOperation({ summary: '建立輪播圖' })
  create(@Body() dto: CreateBannerDto): Promise<BannerResponseDto> {
    return this.bannersService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '查詢輪播圖列表' })
  findAll(
    @Query() query: BannerPaginationQueryDto,
  ): Promise<{ data: BannerResponseDto[]; total: number }> {
    return this.bannersService.findAll(query);
  }

  @Patch('reorder')
  @ApiOperation({ summary: '重新排序輪播圖' })
  reorder(@Body() { ids, offset }: ReorderBannersDto): Promise<void> {
    return this.bannersService.reorder(ids, offset);
  }

  @Patch(':bannerId')
  @ApiOperation({ summary: '更新輪播圖' })
  update(
    @Param('bannerId') bannerId: string,
    @Body() dto: UpdateBannerDto,
  ): Promise<BannerResponseDto> {
    return this.bannersService.update(bannerId, dto);
  }

  @Delete(':bannerId')
  @ApiOperation({ summary: '刪除輪播圖' })
  remove(@Param('bannerId') bannerId: string): Promise<void> {
    return this.bannersService.remove(bannerId);
  }
}
