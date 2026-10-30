import { PartialType } from '@nestjs/swagger';

import { CreateMenuSectionDto } from './create-menu-section.dto.js';

export class UpdateMenuSectionDto extends PartialType(CreateMenuSectionDto, {
  skipNullProperties: false,
}) {}
