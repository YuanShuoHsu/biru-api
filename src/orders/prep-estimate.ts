const MINUTE_MS = 60 * 1000;

const DISPLAY_STEP_MINUTES = 5;

export interface QueuedOrder {
  pickupTime: Date | null;
  prepMinutes: number;
}

export const itemLeadTimeMinutes = (
  leadTimeOf: (menuItemId: string) => number,
  menuItemId: string,
  addOns: { menuItemId: string }[],
): number =>
  Math.max(
    leadTimeOf(menuItemId),
    ...addOns.map((addOn) => leadTimeOf(addOn.menuItemId)),
  );

export const orderPrepMinutes = (
  pickupLeadMinutes: number,
  itemLeadMinutes: number[],
): number => Math.max(pickupLeadMinutes, 0, ...itemLeadMinutes);

export const estimatePrepMinutes = (
  queue: QueuedOrder[],
  ownPrepMinutes: number,
  now: Date,
): { minutes: number; queuedOrders: number } => {
  const asSoonAsReady = queue.filter((queued) => !queued.pickupTime);
  const scheduled = queue
    .filter((queued) => queued.pickupTime)
    .sort((a, b) => a.pickupTime!.getTime() - b.pickupTime!.getTime());

  let minutes = ownPrepMinutes;
  let queuedOrders = 0;
  for (const queued of [...asSoonAsReady, ...scheduled]) {
    if (
      queued.pickupTime &&
      queued.pickupTime.getTime() >= now.getTime() + minutes * MINUTE_MS
    )
      break;

    minutes += queued.prepMinutes;
    queuedOrders++;
  }

  return { minutes, queuedOrders };
};

export const displayPrepMinutes = (minutes: number): number =>
  Math.ceil(minutes / DISPLAY_STEP_MINUTES) * DISPLAY_STEP_MINUTES;
