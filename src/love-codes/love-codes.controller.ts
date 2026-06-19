import { Controller, Get } from '@nestjs/common';

import { LoveCodesService } from './love-codes.service';

@Controller('love-codes')
export class LoveCodesController {
  constructor(private readonly loveCodesService: LoveCodesService) {}

  @Get()
  getAll() {
    return this.loveCodesService.getAll();
  }
}
