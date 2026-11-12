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

export class OperatingTypeResponseDto {
  @ApiProperty({
    enum: organizationOperatingTypeEnum.enumValues,
    enumName: 'OrganizationOperatingType',
    description: '尚未分類的門市為 unclassified',
  })
  operatingType: OrganizationOperatingType;
}
