import {
  ApiProperty,
  ApiPropertyOptional,
  type ApiPropertyOptions,
} from '@nestjs/swagger';

type ApiLocalizedTextPropertyOptions = {
  description?: string;
  example?: unknown;
  isArray?: boolean;
  nullable?: boolean;
};

const localizedTextSchema = {
  type: 'object',
  additionalProperties: { type: 'string' },
} satisfies ApiPropertyOptions;

const localizedTextOptions = ({
  isArray,
  ...options
}: ApiLocalizedTextPropertyOptions) =>
  isArray
    ? { ...options, type: 'array' as const, items: localizedTextSchema }
    : { ...options, ...localizedTextSchema };

export const ApiLocalizedTextProperty = (
  options: ApiLocalizedTextPropertyOptions = {},
) => ApiProperty(localizedTextOptions(options));

export const ApiLocalizedTextPropertyOptional = (
  options: ApiLocalizedTextPropertyOptions = {},
) => ApiPropertyOptional(localizedTextOptions(options));
