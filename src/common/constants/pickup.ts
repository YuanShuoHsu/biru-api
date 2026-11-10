export const PICKUP_MAX_ADVANCE_DAYS = 30;

export const PICKUP_MAX_CUTOFF_MINUTES = 24 * 60;

export const getPickupMaxLeadMinutes = (advanceDays: number) =>
  (advanceDays + 1) * 24 * 60 - 1;
