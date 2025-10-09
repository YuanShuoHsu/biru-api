import { LocalizedText } from './locale.types';

export interface Table {
  id: string;
  name: LocalizedText;
  createdAt: Date;
  isActive: boolean;
  slug: string;
  updatedAt: Date;
}
