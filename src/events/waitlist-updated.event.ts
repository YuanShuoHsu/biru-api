import type { WaitlistTicketStatus } from '../db/schema/waitlist.js';

export const WAITLIST_UPDATED_EVENT = 'waitlist.updated';

export interface WaitlistUpdatedEvent {
  organizationId: string;
  ticket: { id: string; status: WaitlistTicketStatus } | null;
}
