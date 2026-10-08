import { ApiProperty } from '@nestjs/swagger';

export class OrganizationStatsBucketDto {
  @ApiProperty({ format: 'date-time' }) start: string;
  @ApiProperty() organizations: number;
}

export class OrganizationStatsResponseDto {
  @ApiProperty({ description: '目前使用者所屬的組織數' }) total: number;

  @ApiProperty({ type: [OrganizationStatsBucketDto] })
  buckets: OrganizationStatsBucketDto[];

  @ApiProperty({ description: '上期新建立的所屬組織數' }) previous: number;
}
