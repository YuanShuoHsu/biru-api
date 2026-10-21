import { Module } from '@nestjs/common';

import { AdminAuditController } from './admin-audit.controller.js';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';

@Module({
  controllers: [AdminAuditController, AuditController],
  providers: [AuditService],
})
export class AuditModule {}
