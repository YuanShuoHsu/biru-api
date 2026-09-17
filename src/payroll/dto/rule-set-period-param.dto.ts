import { Matches } from 'class-validator';

export class RuleSetPeriodParamDto {
  @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/) effectiveFrom: string;
}
