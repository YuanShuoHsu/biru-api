const MINUTE_MS = 60 * 1000;

const DISPLAY_STEP_MINUTES = 5;

const MIN_OBSERVED_ORDERS = 5;

export interface QueuedOrder {
  pickupTime: Date | null;
  prepMinutes: number;
}

export interface ReadyOrder {
  readyAt: Date;
  startedAt: Date;
}

export interface ReadyOrderItems extends ReadyOrder {
  menuItemIds: string[];
}

export interface ObservedPace {
  busyMs: number;
  intervals: number;
}

export const observedPace = (ready: ReadyOrder[]): ObservedPace | null => {
  if (ready.length < MIN_OBSERVED_ORDERS) return null;

  const sorted = [...ready].sort(
    (a, b) => a.readyAt.getTime() - b.readyAt.getTime(),
  );
  let busyMs = 0;
  for (let i = 1; i < sorted.length; i++)
    busyMs += Math.max(
      0,
      sorted[i].readyAt.getTime() -
        Math.max(
          sorted[i - 1].readyAt.getTime(),
          sorted[i].startedAt.getTime(),
        ),
    );
  if (busyMs < MINUTE_MS) return null;

  return { busyMs, intervals: sorted.length - 1 };
};

export const observedItemPrepMinutes = (orders: ReadyOrderItems[]) => {
  const samples = new Map<string, number[]>();
  for (const { menuItemIds, readyAt, startedAt } of orders) {
    const minutes =
      Math.max(0, readyAt.getTime() - startedAt.getTime()) / MINUTE_MS;
    for (const menuItemId of new Set(menuItemIds))
      samples.set(menuItemId, [...(samples.get(menuItemId) ?? []), minutes]);
  }

  return (
    menuItemId: string,
  ): { averageMinutes: number | null; sampleSize: number } => {
    const minutes = samples.get(menuItemId) ?? [];
    return {
      averageMinutes:
        minutes.length < MIN_OBSERVED_ORDERS
          ? null
          : Math.round(minutes.reduce((sum, m) => sum + m, 0) / minutes.length),
      sampleSize: minutes.length,
    };
  };
};

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
  pace: ObservedPace | null = null,
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

    queuedOrders++;
    minutes = pace
      ? ownPrepMinutes +
        (queuedOrders * pace.busyMs) / (pace.intervals * MINUTE_MS)
      : minutes + queued.prepMinutes;
  }

  return { minutes, queuedOrders };
};

export const displayPrepMinutes = (minutes: number): number =>
  Math.ceil(minutes / DISPLAY_STEP_MINUTES) * DISPLAY_STEP_MINUTES;
