import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { MyOrganizationListItemDto } from './dto/organization-response.dto.js';
import { OrganizationsService } from './organizations.service.js';

@ApiTags('organizations')
@Controller('users/me/organizations')
export class MyOrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get()
  @ApiOperation({ summary: '查詢目前使用者所屬的組織與可執行的操作' })
  @ApiOkResponse({ type: [MyOrganizationListItemDto] })
  findAll(
    @Session() session: UserSession,
  ): Promise<MyOrganizationListItemDto[]> {
    return this.organizationsService.myOrganizations(session.user.id);
  }
}
