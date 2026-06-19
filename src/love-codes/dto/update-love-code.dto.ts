import { PartialType } from '@nestjs/swagger';
import { CreateLoveCodeDto } from './create-love-code.dto';

export class UpdateLoveCodeDto extends PartialType(CreateLoveCodeDto) {}
