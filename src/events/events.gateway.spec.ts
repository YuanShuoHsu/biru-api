import type { AuthService } from '@thallesp/nestjs-better-auth';
import type { Namespace } from 'socket.io';

import type { PublicMenusService } from '../menus/menus-public.service.js';
import type { OrdersService } from '../orders/orders.service.js';
import type { PrepEstimateService } from '../orders/prep-estimate.service.js';
import type { WaitlistService } from '../waitlist/waitlist.service.js';

import { EventsGateway } from './events.gateway.js';

const nextTick = () => new Promise((resolve) => setImmediate(resolve));

describe('EventsGateway prepEstimateUpdated', () => {
  const setup = (rooms: string[]) => {
    const estimate = {
      basis: 'leadTime',
      estimatedMinutes: 15,
      queuedOrders: 1,
    };
    const findByOrganizationId = vi.fn().mockResolvedValue(estimate);
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const gateway = new EventsGateway(
      {} as AuthService,
      {} as PublicMenusService,
      {} as OrdersService,
      { findByOrganizationId } as unknown as PrepEstimateService,
      {} as WaitlistService,
    );
    gateway.server = {
      adapter: { rooms: new Map(rooms.map((room) => [room, new Set()])) },
      to,
    } as unknown as Namespace;

    return { emit, estimate, findByOrganizationId, gateway };
  };

  const statusUpdated = (gateway: EventsGateway, organizationId = 'org') =>
    gateway.handleOrderStatusUpdated({
      orderId: 'o1',
      orderStatus: 'OrderPickupAvailable',
      organizationId,
    });

  it('同一店同一個 tick 的多次狀態變更只重算一次', async () => {
    const { emit, estimate, findByOrganizationId, gateway } = setup([
      'org:org',
    ]);

    statusUpdated(gateway);
    statusUpdated(gateway);
    await nextTick();
    await nextTick();

    expect(findByOrganizationId).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith('prepEstimateUpdated', estimate);
  });

  it('沒有訂閱者的店不重算', async () => {
    const { findByOrganizationId, gateway } = setup(['org:other']);

    statusUpdated(gateway);
    await nextTick();

    expect(findByOrganizationId).not.toHaveBeenCalled();
  });

  it('定期重算時值沒變就不推', async () => {
    const { emit, gateway } = setup(['public-orders-board:org']);

    gateway.refreshPrepEstimates();
    await nextTick();
    await nextTick();
    gateway.refreshPrepEstimates();
    await nextTick();
    await nextTick();

    expect(
      emit.mock.calls.filter(([event]) => event === 'prepEstimateUpdated'),
    ).toHaveLength(1);
  });
});
