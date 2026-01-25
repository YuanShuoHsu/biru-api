import { PartialType } from '@nestjs/swagger';

import { CreateDrizzleDto } from './create-drizzle.dto';

export class UpdateDrizzleDto extends PartialType(CreateDrizzleDto) {}
