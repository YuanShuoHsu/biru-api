import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { eq } from 'drizzle-orm';

import { banner } from '../db/schema/banners.js';
import { menu, menuItem, menuSection, modifier } from '../db/schema/menus.js';
import { storePhoto } from '../db/schema/store-photos.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';

import type { ImageParamsDto } from './dto/image-params.dto.js';
import {
  imageVersion,
  isImageMimeType,
  parseImageDataUrl,
  type ImageKind,
} from './image-url.js';

export const IMAGE_TABLES = {
  menu,
  menuSection,
  menuItem,
  modifier,
  banner,
  storePhoto,
} satisfies Record<ImageKind, unknown>;

@Injectable()
export class ImagesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async find({ kind, id, version, extension }: ImageParamsDto) {
    const table = IMAGE_TABLES[kind];
    const [row] = await this.db
      .select({ image: table.image })
      .from(table)
      .where(eq(table.id, id));

    if (row?.image?.startsWith('https://')) {
      const res = await fetch(row.image, {
        signal: AbortSignal.timeout(10000),
      });
      const mimeType = res.headers.get('content-type') ?? '';
      if (!res.ok || !isImageMimeType(mimeType)) throw new NotFoundException();

      return {
        current: false,
        mimeType,
        data: Buffer.from(await res.arrayBuffer()),
      };
    }

    const parsed = row?.image ? parseImageDataUrl(row.image) : null;
    if (!row?.image || !parsed) throw new NotFoundException();

    return {
      current:
        imageVersion(row.image) === version && parsed.extension === extension,
      mimeType: parsed.mimeType,
      data: Buffer.from(parsed.base64, 'base64'),
    };
  }
}
