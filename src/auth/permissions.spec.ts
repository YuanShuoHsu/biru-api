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

describe('operating cost permissions', () => {
  it.each([
    ['owner', true],
    ['admin', false],
    ['member', false],
    ['user', false],
  ])('%s can manage operating costs: %s', (role, expected) => {
    for (const action of ['create', 'read', 'update', 'delete'])
      expect(isAuthorized(role, { operatingCost: [action] }), action).toBe(
        expected,
      );
  });
});

describe('order review permissions', () => {
  it.each([
    ['owner', true, true],
    ['admin', true, true],
    ['member', true, false],
    ['user', false, false],
  ])('%s can read reviews: %s, reply to them: %s', (role, read, reply) => {
    expect(isAuthorized(role, { review: ['read'] })).toBe(read);
    expect(isAuthorized(role, { review: ['reply'] })).toBe(reply);
  });
});

describe('order export permissions', () => {
  it.each([
    ['owner', true],
    ['admin', true],
    ['member', false],
    ['user', false],
  ])('%s can export orders: %s', (role, expected) => {
    expect(isAuthorized(role, { order: ['export'] })).toBe(expected);
  });
});
