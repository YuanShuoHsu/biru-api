import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { DonateCodesService } from './donate-codes.service.js';
import { DonateCodeResponseDto } from './dto/donate-code-response.dto.js';

@AllowAnonymous()
@Controller('donate-codes')
export class DonateCodesController {
  constructor(private readonly donateCodesService: DonateCodesService) {}

  @Get()
  @ApiOkResponse({ type: [DonateCodeResponseDto] })
  @ApiServiceUnavailableResponse({
    description: '捐贈碼清單尚未從電子發票平台取得',
  })
  getAll(): DonateCodeResponseDto[] {
    return this.donateCodesService.getAll();
  }
}
