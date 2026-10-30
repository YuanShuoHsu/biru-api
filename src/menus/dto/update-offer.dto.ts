import { PartialType } from '@nestjs/swagger';

import { CreateOfferDto } from './create-offer.dto.js';

export class UpdateOfferDto extends PartialType(CreateOfferDto, {
  skipNullProperties: false,
}) {}
