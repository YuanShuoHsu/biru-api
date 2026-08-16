import { Module } from '@nestjs/common';

import { AdminAuditController } from './admin-audit.controller';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Module({
  controllers: [AdminAuditController, AuditController],
  providers: [AuditService],
})
export class AuditModule {}
