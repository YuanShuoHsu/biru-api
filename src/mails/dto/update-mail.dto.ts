import { PartialType } from '@nestjs/swagger';

import { CreateMailDto } from './create-mail.dto.js';

export class UpdateMailDto extends PartialType(CreateMailDto) {}
