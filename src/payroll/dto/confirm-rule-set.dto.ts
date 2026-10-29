import { Transform } from 'class-transformer';
import {
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { trim } from '../../common/utils/trim.js';

export class ConfirmRuleSetDto {
  @Matches(/^\d{1,9}$/) minimumHourlyWageCents: string;
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  sourceLabel: string;
  @IsUrl({ protocols: ['https'], require_protocol: true }) sourceUrl: string;
}
