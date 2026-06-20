import { Controller, Get } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { DonateCodesService } from './donate-codes.service';

@AllowAnonymous()
@Controller('donate-codes')
export class DonateCodesController {
  constructor(private readonly donateCodesService: DonateCodesService) {}

  @Get()
  getAll() {
    return this.donateCodesService.getAll();
  }
}
