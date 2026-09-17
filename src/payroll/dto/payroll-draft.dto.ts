import {
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class PayrollDraftDto {
  @IsUUID() idempotencyKey: string;
  @IsUUID() employeeId: string;
  @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/) month: string;
  @IsString() @MinLength(1) @MaxLength(1000) reason: string;
}
