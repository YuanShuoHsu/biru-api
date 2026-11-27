import { PickType } from '@nestjs/swagger';

import { CreateModifierGroupDto } from '../../menus/dto/create-modifier-group.dto.js';

export class CreateCatalogModifierGroupDto extends PickType(
  CreateModifierGroupDto,
  ['displayName', 'minSelectionCount', 'maxSelectionCount'],
) {}
