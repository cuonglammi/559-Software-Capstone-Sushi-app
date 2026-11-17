// Pure business-rule helpers, unit-tested by Vitest (UT-01 to UT-05).

// FR-A2: at least 8 chars, one uppercase, one lowercase, one number, one special character.
function validatePassword(password) {
  const errors = [];
  if (typeof password !== 'string' || password.length < 8) {
    errors.push('Password must be at least 8 characters long.');
  }
  if (!/[A-Z]/.test(password || '')) errors.push('Password must include an uppercase letter.');
  if (!/[a-z]/.test(password || '')) errors.push('Password must include a lowercase letter.');
  if (!/[0-9]/.test(password || '')) errors.push('Password must include a number.');
  if (!/[^A-Za-z0-9]/.test(password || '')) errors.push('Password must include a special character.');
  return { valid: errors.length === 0, errors };
}

// FR-A4 / NFR-6: 15-minute idle timeout.
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

function isSessionExpired(lastActivityMs, nowMs) {
  return nowMs - lastActivityMs > IDLE_TIMEOUT_MS;
}

// FR-U5: quantity must be an integer from 1 to 10.
function isValidQuantity(quantity) {
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 10;
}

// FR-U6: running total for non-AYCE carts. items: [{ price, quantity }]
function cartTotal(items) {
  return Math.round(
    items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100
  ) / 100;
}

// FR-D4 / FR-U13 / FR-U14: allowed order status transitions.
const ORDER_STATUSES = ['Pending', 'In Progress', 'Completed', 'Cancelled'];

const VALID_TRANSITIONS = {
  Pending: ['In Progress', 'Cancelled'],
  'In Progress': ['Completed', 'Cancelled'],
  Completed: [],
  Cancelled: [],
};

function canTransition(from, to) {
  return Boolean(VALID_TRANSITIONS[from] && VALID_TRANSITIONS[from].includes(to));
}

// FR-U2 / FR-U3 / FR-U4: menu search, filter and sort.
// items: [{ name, description, category, price }]
function filterSortMenu(items, { search, category, sort } = {}) {
  let result = items.slice();
  if (search) {
    const needle = String(search).toLowerCase();
    result = result.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        (item.description || '').toLowerCase().includes(needle)
    );
  }
  if (category) {
    result = result.filter((item) => item.category === category);
  }
  if (sort === 'priceAsc') result.sort((a, b) => a.price - b.price);
  else if (sort === 'priceDesc') result.sort((a, b) => b.price - a.price);
  else if (sort === 'nameAsc') result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}

module.exports = {
  validatePassword,
  isSessionExpired,
  IDLE_TIMEOUT_MS,
  isValidQuantity,
  cartTotal,
  ORDER_STATUSES,
  canTransition,
  filterSortMenu,
};
