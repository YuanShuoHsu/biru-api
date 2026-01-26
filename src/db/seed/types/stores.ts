import { stores } from '../../schema/stores';

export type Store = typeof stores.$inferSelect;
