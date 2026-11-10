import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import {
  Audit,
  type AuditTarget,
} from '../common/decorators/audit.decorator.js';
import { Roles } from '../menus/decorators/roles.decorator.js';

import {
  CreateSpecialHoursDto,
  SpecialHoursDto,
  UpdateSpecialHoursDto,
} from './dto/special-hours.dto.js';
import { SpecialHoursService } from './special-hours.service.js';

const SPECIAL_HOURS_AUDIT: AuditTarget = {
  resource: 'organization',
  idSource: { column: 'organizationId', organization: true },
  via: { table: 'specialHours', ownerColumn: 'organizationId' },
};

const OVERLAP_DESCRIPTION = '與既有區間重疊；回應的 conflict 為衝突的那筆';

@ApiTags('organizations')
@Controller('organizations/:organizationSlug/special-hours')
export class SpecialHoursController {
  constructor(private readonly specialHoursService: SpecialHoursService) {}

  @Get()
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @ApiOkResponse({ isArray: true, type: SpecialHoursDto })
  @ApiOperation({ summary: '查看今天以後的特殊營業日' })
  findAll(
    @Param('organizationSlug') organizationSlug: string,
  ): Promise<SpecialHoursDto[]> {
    return this.specialHoursService.findUpcoming(organizationSlug);
  }

  @Post()
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @Audit(SPECIAL_HOURS_AUDIT)
  @ApiCreatedResponse({ type: SpecialHoursDto })
  @ApiConflictResponse({ description: OVERLAP_DESCRIPTION })
  @ApiOperation({ summary: '新增特殊營業日（臨時公休或調整時段）' })
  create(
    @Param('organizationSlug') organizationSlug: string,
    @Body() dto: CreateSpecialHoursDto,
  ): Promise<SpecialHoursDto> {
    return this.specialHoursService.create(organizationSlug, dto);
  }

  @Patch(':specialHoursId')
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @Audit(SPECIAL_HOURS_AUDIT)
  @ApiOkResponse({ type: SpecialHoursDto })
  @ApiConflictResponse({ description: OVERLAP_DESCRIPTION })
  @ApiOperation({ summary: '更新特殊營業日' })
  update(
    @Param('organizationSlug') organizationSlug: string,
    @Param('specialHoursId') specialHoursId: string,
    @Body() dto: UpdateSpecialHoursDto,
  ): Promise<SpecialHoursDto> {
    return this.specialHoursService.update(
      organizationSlug,
      specialHoursId,
      dto,
    );
  }

  @Delete(':specialHoursId')
  @HttpCode(204)
  @Roles({ organization: ['update'] }, 'organizationSlug')
  @Audit(SPECIAL_HOURS_AUDIT)
  @ApiNoContentResponse()
  @ApiOperation({ summary: '刪除特殊營業日' })
  remove(
    @Param('organizationSlug') organizationSlug: string,
    @Param('specialHoursId') specialHoursId: string,
  ): Promise<void> {
    return this.specialHoursService.remove(organizationSlug, specialHoursId);
  }
}
