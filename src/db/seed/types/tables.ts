import { tables } from '../../schema/stores';

export type Table = Partial<typeof tables.$inferSelect>;
