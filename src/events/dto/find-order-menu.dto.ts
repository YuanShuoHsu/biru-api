import { IsEnum, IsString } from 'class-validator';
import { languagesEnum, type Language } from '../../db/schema/enums.js';

export class FindOrderMenuDto {
  @IsString()
  organizationId: string;

  @IsEnum(languagesEnum.enumValues)
  lang: Language;
}
