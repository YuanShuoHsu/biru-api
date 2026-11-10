import type { TransformFnParams } from 'class-transformer';

export const trim = ({ value }: Pick<TransformFnParams, 'value'>): unknown =>
  typeof value === 'string' ? value.trim() : value;
