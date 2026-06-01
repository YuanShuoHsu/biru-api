import { IsString } from 'class-validator';

export class FindAllMenusDto {
  @IsString()
  storeId: string;

  @IsString()
  lang: string;
}
