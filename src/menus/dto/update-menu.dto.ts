import { PartialType } from '@nestjs/swagger';

import { CreateMenuDto } from './create-menu.dto.js';

export class UpdateMenuDto extends PartialType(CreateMenuDto) {}
