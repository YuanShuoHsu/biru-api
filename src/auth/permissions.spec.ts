import { isAuthorized } from './permissions.js';

describe('refund and invoice void permissions', () => {
  it.each(['owner', 'admin', 'member'])('%s can refund and void', (role) => {
    expect(isAuthorized(role, { refund: ['create'] })).toBe(true);
    expect(isAuthorized(role, { invoice: ['void'] })).toBe(true);
  });

  it('rejects a role that is not a store role', () => {
    expect(isAuthorized('user', { refund: ['create'] })).toBe(false);
    expect(isAuthorized('user', { invoice: ['void'] })).toBe(false);
  });
});
