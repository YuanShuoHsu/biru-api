import { PartialType } from '@nestjs/swagger';

import { CreateDrizzleDto } from './create-drizzle.dto.js';

export class UpdateDrizzleDto extends PartialType(CreateDrizzleDto) {}
