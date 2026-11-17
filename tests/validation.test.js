// Unit tests UT-01 to UT-05 from the Milestone 4 testing plan.
import { describe, it, expect } from 'vitest';
import {
  validatePassword,
  isSessionExpired,
  IDLE_TIMEOUT_MS,
  isValidQuantity,
  cartTotal,
  canTransition,
  filterSortMenu,
} from '../src/validation';

// UT-01: Password policy validation (FR-A2)
describe('UT-01 password policy', () => {
  it('rejects weak passwords', () => {
    expect(validatePassword('password').valid).toBe(false);   // no upper, digit, special
    expect(validatePassword('Password1').valid).toBe(false);  // no special
    expect(validatePassword('Password!').valid).toBe(false);  // no digit
    expect(validatePassword('P@ss1').valid).toBe(false);      // too short
  });

  it('accepts a valid password', () => {
    expect(validatePassword('P@ssword1').valid).toBe(true);
    expect(validatePassword('P@ssword1').errors).toHaveLength(0);
  });

  it('gives clear validation feedback for each failed rule', () => {
    const result = validatePassword('password');
    expect(result.errors.join(' ')).toMatch(/uppercase/);
    expect(result.errors.join(' ')).toMatch(/number/);
    expect(result.errors.join(' ')).toMatch(/special/);
  });
});

// UT-02: Idle session timeout logic (FR-A4, NFR-6)
describe('UT-02 idle session timeout', () => {
  it('invalidates a session idle for 16 minutes', () => {
    const now = Date.now();
    const sixteenMinutesAgo = now - 16 * 60 * 1000;
    expect(isSessionExpired(sixteenMinutesAgo, now)).toBe(true);
  });

  it('keeps a session active within 15 minutes', () => {
    const now = Date.now();
    expect(isSessionExpired(now - 14 * 60 * 1000, now)).toBe(false);
    expect(isSessionExpired(now - IDLE_TIMEOUT_MS, now)).toBe(false); // boundary
  });
});

// UT-03: Cart quantity and total calculation (FR-U5, FR-U6)
describe('UT-03 cart quantity and totals', () => {
  const californiaRoll = { price: 8.99 };
  const greenTea = { price: 2.5 };

  it('calculates the running total for a regular session', () => {
    const total = cartTotal([
      { ...californiaRoll, quantity: 2 },
      { ...greenTea, quantity: 1 },
    ]);
    expect(total).toBe(20.48); // 2 x 8.99 + 2.50
  });

  it('recalculates correctly after a quantity edit from 2 to 3', () => {
    const total = cartTotal([
      { ...californiaRoll, quantity: 3 },
      { ...greenTea, quantity: 1 },
    ]);
    expect(total).toBe(29.47);
  });

  it('keeps quantities within 1-10 and blocks invalid values', () => {
    expect(isValidQuantity(1)).toBe(true);
    expect(isValidQuantity(10)).toBe(true);
    expect(isValidQuantity(0)).toBe(false);
    expect(isValidQuantity(11)).toBe(false);
    expect(isValidQuantity(2.5)).toBe(false);
    expect(isValidQuantity(-3)).toBe(false);
    expect(isValidQuantity('2')).toBe(false);
  });
});

// UT-04: Menu search, filter and sort helpers (FR-U2, FR-U3, FR-U4)
describe('UT-04 menu search, filter, sort', () => {
  const menu = [
    { name: 'Salmon Nigiri', description: 'Atlantic salmon over rice', category: 'Nigiri', price: 5.99 },
    { name: 'Tuna Nigiri', description: 'Fresh bluefin tuna', category: 'Nigiri', price: 5.49 },
    { name: 'Salmon Avocado Roll', description: 'Fresh salmon and avocado', category: 'Rolls', price: 9.99 },
    { name: 'Green Tea', description: 'Hot sencha', category: 'Beverages', price: 2.5 },
  ];

  it('matches keyword against name and description', () => {
    const result = filterSortMenu(menu, { search: 'salmon' });
    expect(result.map((item) => item.name)).toEqual(['Salmon Nigiri', 'Salmon Avocado Roll']);
  });

  it('filters by category', () => {
    const result = filterSortMenu(menu, { category: 'Nigiri' });
    expect(result).toHaveLength(2);
    expect(result.every((item) => item.category === 'Nigiri')).toBe(true);
  });

  it('combines keyword, category filter, and price-ascending sort', () => {
    const result = filterSortMenu(menu, { search: 'salmon', category: 'Nigiri', sort: 'priceAsc' });
    expect(result.map((item) => item.name)).toEqual(['Salmon Nigiri']);
  });

  it('sorts by price ascending and descending, and by name', () => {
    expect(filterSortMenu(menu, { sort: 'priceAsc' })[0].name).toBe('Green Tea');
    expect(filterSortMenu(menu, { sort: 'priceDesc' })[0].name).toBe('Salmon Avocado Roll');
    expect(filterSortMenu(menu, { sort: 'nameAsc' })[0].name).toBe('Green Tea');
  });
});

// UT-05: Order status transition rules (FR-D4, FR-U13, FR-U14)
describe('UT-05 order status transitions', () => {
  it('allows the valid lifecycle Pending -> In Progress -> Completed', () => {
    expect(canTransition('Pending', 'In Progress')).toBe(true);
    expect(canTransition('In Progress', 'Completed')).toBe(true);
  });

  it('allows cancellation before completion', () => {
    expect(canTransition('Pending', 'Cancelled')).toBe(true);
    expect(canTransition('In Progress', 'Cancelled')).toBe(true);
  });

  it('rejects skipped or backward transitions', () => {
    expect(canTransition('Pending', 'Completed')).toBe(false);   // skip
    expect(canTransition('Completed', 'Pending')).toBe(false);   // backward
    expect(canTransition('Completed', 'In Progress')).toBe(false);
    expect(canTransition('Cancelled', 'In Progress')).toBe(false);
    expect(canTransition('In Progress', 'Pending')).toBe(false);
  });

  it('rejects unknown statuses', () => {
    expect(canTransition('Pending', 'Delivered')).toBe(false);
    expect(canTransition('Nope', 'Completed')).toBe(false);
  });
});
