import { PartialType } from '@nestjs/swagger';

import { CreateVerificationDto } from './create-verification.dto';

export class UpdateVerificationDto extends PartialType(CreateVerificationDto) {}
