import { ApiProperty } from '@nestjs/swagger';

import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class UserDeletabilityQueryDto {
  @ApiProperty({ type: [String] })
  @Transform(({ value }: { value: unknown }) => [value].flat())
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids: string[];
}

export class UserDeletabilityDto {
  @ApiProperty() id: string;

  @ApiProperty({
    description: '有出勤或薪資紀錄、或是某組織唯一的擁有者時不可刪除',
  })
  deletable: boolean;
}
