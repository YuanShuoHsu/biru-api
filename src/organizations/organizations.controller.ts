import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AllowAnonymous,
  Session,
  type UserSession,
} from '@thallesp/nestjs-better-auth';

import { AdminGuard } from 'src/common/guards/admin.guard';

import { asc, isNull } from 'drizzle-orm';
import { organization } from 'src/db/schema/organizations';

import { OrganizationListQueryDto } from './dto/organization-list-query.dto';
import { OrganizationMemberResponseDto } from './dto/organization-member-response.dto';
import { OrganizationResponseDto } from './dto/organization-response.dto';
import { OrganizationsService } from './organizations.service';

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
  async findOne(@Param('slug') slug: string): Promise<OrganizationResponseDto> {
    const org = await this.organizationsService.organizationBySlug(slug);
    if (!org) throw new NotFoundException();

    return org;
  }

  @Get(':id/members')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '查詢組織成員' })
  findMembers(
    @Param('id') id: string,
  ): Promise<OrganizationMemberResponseDto[]> {
    return this.organizationsService.organizationMembers(id);
  }
}
