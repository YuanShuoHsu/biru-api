import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { AdminGuard } from 'src/common/guards/admin.guard';

import { asc, isNull } from 'drizzle-orm';
import { organization } from 'src/db/schema/organizations';

import { OrganizationMemberResponseDto } from './dto/organization-member-response.dto';
import { OrganizationResponseDto } from './dto/organization-response.dto';
import { OrganizationsService } from './organizations.service';

@AllowAnonymous()
@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: '查詢營業中的組織' })
  findAll(): Promise<OrganizationResponseDto[]> {
    return this.organizationsService.organizations({
      where: isNull(organization.closedAt),
      orderBy: [asc(organization.createdAt)],
    });
  }

  @Get(':slug')
  @ApiOperation({ summary: '查詢組織' })
  async findOne(@Param('slug') slug: string): Promise<OrganizationResponseDto> {
    const org = await this.organizationsService.organization({ slug });
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
