import { PickType } from '@nestjs/swagger';

import { CreateModifierDto } from '../../menus/dto/create-modifier.dto.js';

export class CreateCatalogModifierDto extends PickType(CreateModifierDto, [
  'displayName',
  'image',
  'priceAdjustment',
]) {}
