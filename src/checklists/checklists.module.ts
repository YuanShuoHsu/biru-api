import { Module } from '@nestjs/common';

import { ChecklistRunsController } from './checklist-runs.controller.js';
import { ChecklistRunsService } from './checklist-runs.service.js';
import { ChecklistTemplatesController } from './checklist-templates.controller.js';
import { ChecklistTemplatesService } from './checklist-templates.service.js';

@Module({
  controllers: [ChecklistTemplatesController, ChecklistRunsController],
  providers: [ChecklistTemplatesService, ChecklistRunsService],
})
export class ChecklistsModule {}
