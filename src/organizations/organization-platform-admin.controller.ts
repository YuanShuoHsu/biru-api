import { Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import type { Request } from 'express';

import { AuthBatchService } from '../auth/auth-batch.service.js';
import { Audit } from '../common/decorators/audit.decorator.js';
import { AdminGuard } from '../common/guards/admin.guard.js';
import { OrganizationMember } from '../menus/decorators/roles.decorator.js';

import { MemberResponseDto } from './dto/organization-member-response.dto.js';
import { OrganizationsService } from './organizations.service.js';

@ApiTags('organizations')
@Controller('organizations/:organizationId')
export class OrganizationPlatformAdminController {
  constructor(
    private readonly authBatchService: AuthBatchService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  @Post('platform-admin-membership')
  @UseGuards(AdminGuard)
  @OrganizationMember('organizationId')
  @Audit('member', { response: true })
  @ApiOperation({ summary: '以平台管理員身分加入門市，角色為 owner' })
  @ApiOkResponse({ type: MemberResponseDto })
  join(
    @Req() { headers }: Request,
    @Param('organizationId') organizationId: string,
    @Session() session: UserSession,
  ): Promise<MemberResponseDto> {
    return this.authBatchService.addPlatformAdminMember(
      headers,
      organizationId,
      session.user.id,
    );
  }

  @Post('members/:memberId/confirm-owner')
  @OrganizationMember('organizationId')
  @Audit('member', { param: 'memberId' })
  @ApiOperation({
    summary: '把以平台管理員身分加入的成員轉為真正店主；限真正店主或平台管理員',
  })
  @ApiOkResponse({ type: MemberResponseDto })
  confirmOwner(
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
    @Session() session: UserSession,
  ): Promise<MemberResponseDto> {
    return this.organizationsService.confirmOwner(organizationId, memberId, {
      platformAdmin: session.user.role === 'admin',
      userId: session.user.id,
    });
  }
}
