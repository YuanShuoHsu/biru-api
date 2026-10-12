import { ApiProperty } from '@nestjs/swagger';

export class OrganizationDeletabilityDto {
  @ApiProperty({
    description: '有訂單、出勤或薪資紀錄時依法須保存，不可刪除',
  })
  deletable: boolean;
}
