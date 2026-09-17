import { IsString, MaxLength, MinLength } from 'class-validator';

export class PayrollReviewDto {
  @IsString() @MinLength(1) @MaxLength(1000) reason: string;
}
