import type { WaitlistTicketStatus } from 'src/db/schema/waitlist';

export const WAITLIST_UPDATED_EVENT = 'waitlist.updated';

export interface WaitlistUpdatedEvent {
  organizationId: string;
  ticket: { id: string; status: WaitlistTicketStatus } | null;
}
