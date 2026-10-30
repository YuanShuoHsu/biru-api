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

import {
  CreateStorePhotoDto,
  UpdateStorePhotoDto,
} from './dto/create-store-photo.dto.js';
import { ReorderStorePhotosDto } from './dto/reorder-store-photos.dto.js';
import { StorePhotoPaginationQueryDto } from './dto/store-photo-pagination-query.dto.js';
import {
  StorePhotoListResponseDto,
  StorePhotoResponseDto,
} from './dto/store-photo-response.dto.js';
import { StorePhotosService } from './store-photos.service.js';

@ApiTags('store-photos')
@UseGuards(AdminGuard)
@Controller('store-photos')
export class AdminStorePhotosController {
  constructor(private readonly storePhotosService: StorePhotosService) {}

  @Post()
  @Audit('storePhoto', { response: true })
  @ApiOperation({ summary: '建立門市照片' })
  create(@Body() dto: CreateStorePhotoDto): Promise<StorePhotoResponseDto> {
    return this.storePhotosService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '查詢門市照片列表' })
  @ApiOkResponse({ type: StorePhotoListResponseDto })
  findAll(
    @Query() query: StorePhotoPaginationQueryDto,
  ): Promise<StorePhotoListResponseDto> {
    return this.storePhotosService.findAll(query);
  }

  @Patch('reorder')
  @Audit('storePhoto', { body: 'ids' })
  @ApiOperation({ summary: '重新排序門市照片' })
  reorder(@Body() { ids, offset }: ReorderStorePhotosDto): Promise<void> {
    return this.storePhotosService.reorder(ids, offset);
  }

  @Delete()
  @Audit('storePhoto', { body: 'ids' })
  @ApiOperation({ summary: '批次刪除門市照片' })
  removeMany(@Body() { ids }: IdsDto): Promise<void> {
    return this.storePhotosService.removeMany(ids);
  }

  @Patch(':storePhotoId')
  @Audit('storePhoto', { param: 'storePhotoId' })
  @ApiOperation({ summary: '更新門市照片' })
  update(
    @Param('storePhotoId') storePhotoId: string,
    @Body() dto: UpdateStorePhotoDto,
  ): Promise<StorePhotoResponseDto> {
    return this.storePhotosService.update(storePhotoId, dto);
  }

  @Delete(':storePhotoId')
  @Audit('storePhoto', { param: 'storePhotoId' })
  @ApiOperation({ summary: '刪除門市照片' })
  remove(@Param('storePhotoId') storePhotoId: string): Promise<void> {
    return this.storePhotosService.remove(storePhotoId);
  }
}
