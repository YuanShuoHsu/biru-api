import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class PayrollReviewDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class PayrollBatchReviewDto extends PayrollReviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  ids: string[];
}
