import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';

import { ValidateBy, type ValidationOptions } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

import type { I18nTranslations } from '../../generated/i18n.generated.js';
import { isValidBusinessNumber } from '../utils/business-number.js';

export const IsBusinessNumber = (validationOptions?: ValidationOptions) =>
  applyDecorators(
    ApiProperty({
      description: '統一編號（8 位數字，須通過檢查碼）',
      pattern: '^\\d{8}$',
    }),
    ValidateBy(
      {
        name: 'isBusinessNumber',
        validator: {
          validate: (value: unknown) =>
            typeof value === 'string' && isValidBusinessNumber(value),
        },
      },
      {
        message: i18nValidationMessage<I18nTranslations>(
          'validation.businessNumber',
        ),
        ...validationOptions,
      },
    ),
  );
