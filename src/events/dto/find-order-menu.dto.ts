import { IsString } from 'class-validator';

export class FindOrderMenuDto {
  @IsString()
  organizationId: string;

  @IsString()
  lang: string;
}
