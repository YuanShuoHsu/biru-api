import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AllowAnonymous,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';

import { Audit } from '../common/decorators/audit.decorator.js';
import { OrganizationId } from '../menus/decorators/organization-id.decorator.js';
import type { AuthRequest } from '../menus/guards/roles.guard.js';
import { OrganizationMember } from '../menus/decorators/roles.decorator.js';

import { asc, isNull } from 'drizzle-orm';
import { organization } from '../db/schema/organizations.js';

import { OrganizationListQueryDto } from './dto/organization-list-query.dto.js';
import {
  MemberShowcaseResponseDto,
  OrganizationTeamMemberResponseDto,
} from './dto/organization-member-response.dto.js';
import {
  OrganizationDetailResponseDto,
  OrganizationResponseDto,
} from './dto/organization-response.dto.js';
import { UpdateMemberShowcaseDto } from './dto/update-member-showcase.dto.js';
import { OrganizationsService } from './organizations.service.js';

@AllowAnonymous()
@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @ApiOperation({
    summary: '查詢營業中的組織；平台管理員可帶 includeClosed 含停業',
  })
  findAll(
    @Query() { includeClosed }: OrganizationListQueryDto,
    @Session() session: UserSession | null,
  ): Promise<OrganizationResponseDto[]> {
    if (includeClosed && session?.user.role !== 'admin')
      throw new ForbiddenException();

    return this.organizationsService.organizations({
      where: includeClosed ? undefined : isNull(organization.closedAt),
      orderBy: [asc(organization.createdAt)],
    });
  }

  @Get(':slug')
  @ApiOperation({ summary: '查詢組織；舊 slug 也查得到，回傳的 slug 為現行值' })
  @ApiOkResponse({ type: OrganizationDetailResponseDto })
  async findOne(
    @Param('slug') slug: string,
  ): Promise<OrganizationDetailResponseDto> {
    const org = await this.organizationsService.organizationBySlug(slug);
    if (!org) throw new NotFoundException();

    return {
      ...org,
      specialHours: await this.organizationsService.upcomingSpecialHours(
        org.id,
      ),
    };
  }

  @Get(':slug/team')
  @ApiOperation({ summary: '查詢組織在官網公開的團隊成員' })
  @ApiOkResponse({ type: [OrganizationTeamMemberResponseDto] })
  findTeam(
    @Param('slug') slug: string,
  ): Promise<OrganizationTeamMemberResponseDto[]> {
    return this.organizationsService.organizationTeam(slug);
  }

  @Patch(':organizationSlug/members/:memberId/showcase')
  @OrganizationMember('organizationSlug')
  @Audit('member', { param: 'memberId' })
  @ApiOperation({
    summary:
      '設定成員是否顯示在官網的團隊介紹；只有本人能開啟，owner／admin 只能關閉其他成員',
  })
  @ApiOkResponse({ type: MemberShowcaseResponseDto })
  setMemberShowcase(
    @Param('memberId') memberId: string,
    @Body() { showcase }: UpdateMemberShowcaseDto,
    @OrganizationId() organizationId: string,
    @Session() session: UserSession,
    @Req() req: AuthRequest,
  ): Promise<MemberShowcaseResponseDto> {
    return this.organizationsService.setMemberShowcase(
      organizationId,
      memberId,
      showcase,
      { role: req.memberRole!, userId: session.user.id },
    );
  }
}
