import { PartialType } from '@nestjs/swagger';

import { CreateGciDto } from './create-gci.dto';

export class UpdateGciDto extends PartialType(CreateGciDto) {}
