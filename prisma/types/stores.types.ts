import type { LocaleCode, LocalizedText } from './locale.types';

export interface Store {
  id: string;
  name: LocalizedText;
  address: string;
  createdAt: Date;
  isActive: boolean;
  slug: string;
  updatedAt: Date;
}

export type StoreId = Store['id'];
export type StoreName = Store['name'][LocaleCode];
