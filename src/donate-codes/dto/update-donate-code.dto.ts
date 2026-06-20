import { PartialType } from '@nestjs/swagger';

import { CreateDonateCodeDto } from './create-donate-code.dto';

export class UpdateDonateCodeDto extends PartialType(CreateDonateCodeDto) {}
