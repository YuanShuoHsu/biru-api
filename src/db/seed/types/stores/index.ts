import { stores } from '../../../schema/stores';

export type Store = typeof stores.$inferSelect;

export * from './menus';
export * from './tables';
