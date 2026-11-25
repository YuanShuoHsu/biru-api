import { PartialType } from '@nestjs/swagger';

import { CreateCatalogSectionDto } from './create-catalog-section.dto.js';

export class UpdateCatalogSectionDto extends PartialType(
  CreateCatalogSectionDto,
  { skipNullProperties: false },
) {}
