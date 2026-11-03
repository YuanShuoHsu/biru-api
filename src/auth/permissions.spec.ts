import { isAuthorized } from './permissions.js';

describe('refund and invoice void permissions', () => {
  it.each(['owner', 'admin', 'member', 'user'])(
    '%s can refund and void exactly when it can update orders',
    (role) => {
      const canUpdateOrders = isAuthorized(role, { order: ['update'] });

      expect(isAuthorized(role, { refund: ['create'] })).toBe(canUpdateOrders);
      expect(isAuthorized(role, { invoice: ['void'] })).toBe(canUpdateOrders);
    },
  );
});
