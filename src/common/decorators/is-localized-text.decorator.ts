import {
  buildMessage,
  ValidateBy,
  type ValidationOptions,
} from 'class-validator';

import { languagesEnum } from '../../db/schema/enums.js';

const languages: readonly string[] = languagesEnum.enumValues;

export const isLocalizedText = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.entries(value).every(
    ([language, text]) =>
      languages.includes(language) && typeof text === 'string',
  );

export const IsLocalizedText = (validationOptions?: ValidationOptions) =>
  ValidateBy(
    {
      name: 'isLocalizedText',
      validator: {
        validate: isLocalizedText,
        defaultMessage: buildMessage(
          (eachPrefix) =>
            `${eachPrefix}$property must map language codes (${languages.join(', ')}) to strings`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
