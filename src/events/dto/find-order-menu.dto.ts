import { IsEnum, IsString } from 'class-validator';
import { languagesEnum, type Language } from 'src/db/schema/enums';

export class FindOrderMenuDto {
  @IsString()
  organizationId: string;

  @IsEnum(languagesEnum.enumValues)
  lang: Language;
}
