import { PartialType } from '@nestjs/swagger';

import { CreateCatalogModifierDto } from './create-catalog-modifier.dto.js';

export class UpdateCatalogModifierDto extends PartialType(
  CreateCatalogModifierDto,
  { skipNullProperties: false },
) {}
