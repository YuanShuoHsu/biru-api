import { Controller, Get, Param, Res, StreamableFile } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import type { Response } from 'express';

import { ImageParamsDto } from './dto/image-params.dto.js';
import { ImagesService } from './images.service.js';

// https://docs.nestjs.com/techniques/streaming-files
@ApiTags('images')
@AllowAnonymous()
@SkipThrottle()
@Controller('images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Get(':kind/:id/:version.:extension')
  @ApiOperation({ summary: '取得菜單、分類、品項、橫幅與門市照片的圖片' })
  @ApiProduces('image/*')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async find(
    @Param() params: ImageParamsDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { current, mimeType, data } = await this.imagesService.find(params);

    // 錯誤回應不能帶永久快取，所以不用 @Header()
    // https://www.rfc-editor.org/rfc/rfc9111#section-5.2.2.4
    res.set({
      'Cache-Control': current
        ? 'public, max-age=31536000, immutable'
        : 'public, no-cache',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'none'; sandbox;",
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });

    return new StreamableFile(data, { type: mimeType });
  }
}
