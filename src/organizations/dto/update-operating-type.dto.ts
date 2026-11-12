import { ApiProperty } from '@nestjs/swagger';

import { IsEnum } from 'class-validator';

import {
  type OrganizationOperatingType,
  organizationOperatingTypeEnum,
} from '../../db/schema/organizations.js';

export class UpdateOperatingTypeDto {
  @ApiProperty({
    enum: organizationOperatingTypeEnum.enumValues,
    enumName: 'OrganizationOperatingType',
  })
  @IsEnum(organizationOperatingTypeEnum.enumValues)
  operatingType: OrganizationOperatingType;
}
