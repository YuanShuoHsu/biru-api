import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { DonateCodesService } from './donate-codes.service.js';
import { DonateCodeResponseDto } from './dto/donate-code-response.dto.js';

@AllowAnonymous()
@Controller('donate-codes')
export class DonateCodesController {
  constructor(private readonly donateCodesService: DonateCodesService) {}

  @Get()
  @ApiOkResponse({ type: [DonateCodeResponseDto] })
  getAll(): DonateCodeResponseDto[] {
    return this.donateCodesService.getAll();
  }
}
