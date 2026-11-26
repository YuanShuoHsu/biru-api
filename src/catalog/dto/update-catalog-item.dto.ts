import { PartialType } from '@nestjs/swagger';

import { CreateCatalogItemDto } from './create-catalog-item.dto.js';

export class UpdateCatalogItemDto extends PartialType(CreateCatalogItemDto, {
  skipNullProperties: false,
}) {}
