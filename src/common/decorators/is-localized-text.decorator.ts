import {
  buildMessage,
  ValidateBy,
  type ValidationOptions,
} from 'class-validator';

import { languagesEnum } from '../../db/schema/enums.js';
import { hasLocalizedText, isLocalizedText } from '../utils/localized-text.js';

export const IsLocalizedText = (validationOptions?: ValidationOptions) =>
  ValidateBy(
    {
      name: 'isLocalizedText',
      validator: {
        validate: isLocalizedText,
        defaultMessage: buildMessage(
          (eachPrefix) =>
            `${eachPrefix}$property must map language codes (${languagesEnum.enumValues.join(', ')}) to strings`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );

export const IsRequiredLocalizedText = (
  validationOptions?: ValidationOptions,
) =>
  ValidateBy(
    {
      name: 'isRequiredLocalizedText',
      validator: {
        validate: hasLocalizedText,
        defaultMessage: buildMessage(
          (eachPrefix) =>
            `${eachPrefix}$property must have at least one non-blank translation`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
