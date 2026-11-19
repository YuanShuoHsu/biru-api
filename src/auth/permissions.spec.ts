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

describe('OR connector', () => {
  it.each([
    ['owner', true],
    ['admin', true],
    ['member', false],
  ])('%s passes a request for any one of the actions: %s', (role, expected) => {
    expect(
      isAuthorized(role, {
        member: { actions: ['update', 'delete'], connector: 'OR' },
      }),
    ).toBe(expected);
  });
});

describe('cash device permissions', () => {
  it.each([
    ['owner', true],
    ['admin', true],
    ['member', false],
    ['user', false],
  ])('%s can manage cash devices: %s', (role, expected) => {
    for (const action of ['create', 'update', 'delete'])
      expect(isAuthorized(role, { cashDevice: [action] }), action).toBe(
        expected,
      );
  });

  it.each([
    ['owner', true],
    ['admin', true],
    ['member', true],
    ['user', false],
  ])('%s can read, refill and collect cash devices: %s', (role, expected) => {
    for (const action of ['read', 'refill', 'collection'])
      expect(isAuthorized(role, { cashDevice: [action] }), action).toBe(
        expected,
      );
  });
});
