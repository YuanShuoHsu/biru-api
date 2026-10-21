import { PartialType } from '@nestjs/swagger';

import { CreateDonateCodeDto } from './create-donate-code.dto.js';

export class UpdateDonateCodeDto extends PartialType(CreateDonateCodeDto) {}
