import {
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ConfirmRuleSetDto {
  @Matches(/^\d{1,9}$/) minimumHourlyWageCents: string;
  @IsString() @MinLength(1) @MaxLength(200) sourceLabel: string;
  @IsUrl({ protocols: ['https'], require_protocol: true }) sourceUrl: string;
}
