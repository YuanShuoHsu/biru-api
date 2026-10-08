import {
  getMinutesUntilClose,
  isWithinOpeningHours,
} from 'src/common/utils/opening-hours';
import type {
  WaitlistGroup,
  WaitlistTicket,
  WaitlistTicketStatus,
} from 'src/db/schema/waitlist';

export const DEFAULT_CUTOFF_MINUTES = 60;
export const DEFAULT_GRACE_MINUTES = 10;
export const DEFAULT_HOLD_MINUTES = 10;

export const DEFAULT_WAITLIST_GROUPS: WaitlistGroup[] = [
  { maxPartySize: 2, minPartySize: 1, prefix: 'A' },
  { maxPartySize: 4, minPartySize: 3, prefix: 'B' },
  { maxPartySize: 10, minPartySize: 5, prefix: 'C' },
];

export const STAFF_TRANSITION_STATUSES = [
  'waiting',
  'called',
  'seated',
  'noShow',
  'cancelled',
] as const satisfies readonly WaitlistTicketStatus[];

export type StaffTransitionStatus = (typeof STAFF_TRANSITION_STATUSES)[number];

const TRANSITIONS: Record<WaitlistTicketStatus, WaitlistTicketStatus[]> = {
  waiting: ['called', 'seated', 'cancelled'],
  called: ['waiting', 'called', 'seated', 'noShow', 'cancelled'],
  noShow: ['called', 'seated'],
  seated: ['called'],
  cancelled: [],
};

export const isRevert = (
  from: WaitlistTicketStatus,
  to: WaitlistTicketStatus,
): boolean =>
  (from === 'called' && to === 'waiting') ||
  (from === 'noShow' && to === 'called') ||
  (from === 'seated' && to === 'called');

export const canTransition = (
  from: WaitlistTicketStatus,
  to: WaitlistTicketStatus,
): boolean => TRANSITIONS[from].includes(to);

// 各組人數區間須從 1 起連續、不重疊
export const isValidGroups = (
  groups: Omit<WaitlistGroup, 'prefix'>[],
): boolean => {
  if (!groups.length) return false;

  const sorted = [...groups].sort((a, b) => a.minPartySize - b.minPartySize);

  return sorted.every(
    ({ maxPartySize, minPartySize }, index) =>
      minPartySize <= maxPartySize &&
      minPartySize === (index ? sorted[index - 1].maxPartySize + 1 : 1),
  );
};

export const findGroup = (
  groups: WaitlistGroup[],
  partySize: number,
): WaitlistGroup | undefined =>
  groups.find(
    ({ maxPartySize, minPartySize }) =>
      minPartySize <= partySize && partySize <= maxPartySize,
  );

export const formatTicketNumber = (prefix: string, number: number): string =>
  `${prefix}${String(number).padStart(3, '0')}`;

export const getAvailability = (
  openingHours: string | null,
  cutoffMinutes: number,
  at: Date,
): { cutoff: boolean; open: boolean } => {
  const open = isWithinOpeningHours(openingHours, at);

  return {
    cutoff: open && getMinutesUntilClose(openingHours, at) < cutoffMinutes,
    open,
  };
};

export const isOverdue = (
  ticket: Pick<WaitlistTicket, 'calledAt' | 'status'>,
  holdMinutes: number,
  at: Date,
): boolean => {
  const holdUntil = getHoldUntil(ticket, holdMinutes);

  return !!holdUntil && holdUntil.getTime() <= at.getTime();
};

export const getAutoNoShowAt = (
  ticket: Pick<WaitlistTicket, 'calledAt' | 'status'>,
  holdMinutes: number,
  graceMinutes: number,
): Date | null => {
  const holdUntil = getHoldUntil(ticket, holdMinutes);

  return graceMinutes > 0 && holdUntil
    ? new Date(holdUntil.getTime() + graceMinutes * 60 * 1000)
    : null;
};

export const getHoldUntil = (
  { calledAt, status }: Pick<WaitlistTicket, 'calledAt' | 'status'>,
  holdMinutes: number,
): Date | null =>
  status === 'called' && calledAt
    ? new Date(calledAt.getTime() + holdMinutes * 60 * 1000)
    : null;
