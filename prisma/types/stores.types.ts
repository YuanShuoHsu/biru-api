import { LocalizedText } from './locale.types';

export interface Store {
  id: string;
  name: LocalizedText;
  createdAt: string;
  updatedAt: string;
}
