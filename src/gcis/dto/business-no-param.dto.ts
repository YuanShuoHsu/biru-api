import { IsBusinessNumber } from '../../common/decorators/is-business-number.decorator.js';

export class BusinessNoParamDto {
  @IsBusinessNumber() businessNo: string;
}
