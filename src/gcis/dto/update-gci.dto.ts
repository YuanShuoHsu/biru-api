import { PartialType } from '@nestjs/swagger';

import { CreateGciDto } from './create-gci.dto.js';

export class UpdateGciDto extends PartialType(CreateGciDto) {}
