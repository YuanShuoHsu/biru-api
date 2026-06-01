import { IsEnum, IsString } from 'class-validator';
import { languageEnum, type Language } from 'src/db/schema/menus';

export class FindOrderMenuDto {
  @IsString()
  organizationId: string;

  @IsEnum(languageEnum.enumValues)
  lang: Language;
}
