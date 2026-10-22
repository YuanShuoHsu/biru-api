import { Module } from '@nestjs/common';

import { PrintersService } from './printers.service.js';
import { ServerDirectPrintController } from './server-direct-print.controller.js';

@Module({
  controllers: [ServerDirectPrintController],
  providers: [PrintersService],
  exports: [PrintersService],
})
export class PrintersModule {}
