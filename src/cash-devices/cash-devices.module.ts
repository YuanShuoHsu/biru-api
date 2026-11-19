import { Module } from '@nestjs/common';

import { CashDevicesController } from './cash-devices.controller.js';
import { CashDevicesService } from './cash-devices.service.js';

@Module({
  controllers: [CashDevicesController],
  providers: [CashDevicesService],
})
export class CashDevicesModule {}
