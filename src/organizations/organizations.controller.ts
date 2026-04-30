import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { OrganizationResponseDto } from './dto/organization-response.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: '查詢所有組織' })
  findAll(): Promise<OrganizationResponseDto[]> {
    return this.organizationsService.organizations({});
  }

  @Get(':slug')
  @ApiOperation({ summary: '查詢組織' })
  async findOne(@Param('slug') slug: string): Promise<OrganizationResponseDto> {
    const org = await this.organizationsService.organization({ slug });
    if (!org) throw new NotFoundException();

    return org;
  }
}
