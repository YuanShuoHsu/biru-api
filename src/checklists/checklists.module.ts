import { Module } from '@nestjs/common';

import { ChecklistTemplatesController } from './checklist-templates.controller.js';
import { ChecklistTemplatesService } from './checklist-templates.service.js';

@Module({
  controllers: [ChecklistTemplatesController],
  providers: [ChecklistTemplatesService],
})
export class ChecklistsModule {}
