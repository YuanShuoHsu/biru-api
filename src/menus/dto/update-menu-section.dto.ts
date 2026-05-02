import { PartialType } from '@nestjs/swagger';

import { CreateMenuSectionDto } from './create-menu-section.dto';

export class UpdateMenuSectionDto extends PartialType(CreateMenuSectionDto) {}
