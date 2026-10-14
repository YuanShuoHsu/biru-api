import { Body, Controller, Delete, Param, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import type { Request } from 'express';

import { AuthBatchService } from 'src/auth/auth-batch.service';
import { IdsDto } from 'src/common/dto/ids.dto';
import { OrganizationMember } from 'src/menus/decorators/roles.decorator';

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationBatchController {
  constructor(private readonly authBatchService: AuthBatchService) {}

  @Delete()
  @ApiOperation({ summary: '批次刪除組織' })
  removeMany(
    @Req() { headers }: Request,
    @Body() { ids }: IdsDto,
  ): Promise<void> {
    return this.authBatchService.deleteOrganizations(headers, ids);
  }

  @Delete(':organizationId/members')
  @OrganizationMember('organizationId')
  @ApiOperation({ summary: '批次移除組織成員' })
  removeMembers(
    @Req() { headers }: Request,
    @Param('organizationId') organizationId: string,
    @Body() { ids }: IdsDto,
  ): Promise<void> {
    return this.authBatchService.removeMembers(headers, organizationId, ids);
  }

  @Delete(':organizationId/invitations')
  @OrganizationMember('organizationId')
  @ApiOperation({ summary: '批次取消組織邀請' })
  cancelInvitations(
    @Req() { headers }: Request,
    @Param('organizationId') organizationId: string,
    @Body() { ids }: IdsDto,
  ): Promise<void> {
    return this.authBatchService.cancelInvitations(
      headers,
      organizationId,
      ids,
    );
  }

  @Delete(':organizationId/teams')
  @OrganizationMember('organizationId')
  @ApiOperation({ summary: '批次移除小組' })
  removeTeams(
    @Req() { headers }: Request,
    @Param('organizationId') organizationId: string,
    @Body() { ids }: IdsDto,
  ): Promise<void> {
    return this.authBatchService.removeTeams(headers, organizationId, ids);
  }

  @Delete(':organizationId/teams/:teamId/members')
  @OrganizationMember('organizationId')
  @ApiOperation({ summary: '批次移除小組成員' })
  removeTeamMembers(
    @Req() { headers }: Request,
    @Param('organizationId') organizationId: string,
    @Param('teamId') teamId: string,
    @Body() { ids }: IdsDto,
  ): Promise<void> {
    return this.authBatchService.removeTeamMembers(
      headers,
      organizationId,
      teamId,
      ids,
    );
  }
}
