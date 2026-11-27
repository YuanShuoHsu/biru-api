import { PartialType } from '@nestjs/swagger';

import { CreateCatalogModifierGroupDto } from './create-catalog-modifier-group.dto.js';

export class UpdateCatalogModifierGroupDto extends PartialType(
  CreateCatalogModifierGroupDto,
  { skipNullProperties: false },
) {}
