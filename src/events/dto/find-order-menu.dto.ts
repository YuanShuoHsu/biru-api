import { IsString } from 'class-validator';

export class FindOrderMenuDto {
  @IsString()
  storeId: string;

  @IsString()
  lang: string;
}
