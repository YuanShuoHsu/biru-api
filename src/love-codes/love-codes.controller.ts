import { Controller, Get } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { LoveCodesService } from './love-codes.service';

@AllowAnonymous()
@Controller('love-codes')
export class LoveCodesController {
  constructor(private readonly loveCodesService: LoveCodesService) {}

  @Get()
  getAll() {
    return this.loveCodesService.getAll();
  }
}
