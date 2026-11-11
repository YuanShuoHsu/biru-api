import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminGuard } from '../common/guards/admin.guard.js';

import {
  ImageOrphanSweepDto,
  ImageOrphanSweepResponseDto,
} from './dto/image-orphan-sweep.dto.js';
import { ImageOrphansService } from './image-orphans.service.js';

@ApiTags('images')
@UseGuards(AdminGuard)
@Controller('images/orphans')
export class AdminImagesController {
  constructor(private readonly imageOrphansService: ImageOrphansService) {}

  @Post('sweep')
  @ApiOperation({ summary: '清理儲存空間中沒有資料參照的圖片' })
  sweep(
    @Body() { apply = false }: ImageOrphanSweepDto,
  ): Promise<ImageOrphanSweepResponseDto> {
    return this.imageOrphansService.sweep(apply);
  }
}
