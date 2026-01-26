import { tables } from '../../../schema/stores';

export type Table = Omit<typeof tables.$inferSelect, 'storeId'>;
