import { PartialType } from '@nestjs/swagger';

import { CreateAuthDto } from './create-auth.dto.js';

export class UpdateAuthDto extends PartialType(CreateAuthDto) {}
