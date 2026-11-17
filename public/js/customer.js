// Customer menu, cart and ordering (FR-U1 to FR-U8).
const msg = document.getElementById('msg');
const menuBox = document.getElementById('menu');
const categorySelect = document.getElementById('category');
const searchInput = document.getElementById('search');
const sortSelect = document.getElementById('sort');
const cartSummary = document.getElementById('cart-summary');
const submitBtn = document.getElementById('submit-order-btn');
const cartDialog = document.getElementById('cart-dialog');

const tableNumber = Number(window.location.pathname.split('/')[2]);
let session = null;
// cart: Map menuItemId -> { item, quantity, notes }
const cart = new Map();

function cartItems() { return [...cart.values()]; }

function cartCount() { return cartItems().reduce((n, c) => n + c.quantity, 0); }

function cartTotal() {
  return cartItems().reduce((sum, c) => sum + c.item.price * c.quantity, 0);
}

function updateCartBar() {
  const count = cartCount();
  if (count === 0) {
    cartSummary.textContent = 'Cart is empty';
    submitBtn.disabled = true;
  } else {
    const totalText = session && session.isAyce ? 'All You Can Eat' : money(cartTotal());
    cartSummary.textContent = `${count} item${count === 1 ? '' : 's'} · ${totalText}`;
    submitBtn.disabled = false;
  }
}

function addToCart(item, quantity, notes) {
  const existing = cart.get(item.menuItemId);
  const newQty = (existing ? existing.quantity : 0) + quantity;
  if (newQty > 10) {
    show(msg, 'You can order at most 10 of one item per order.', 'error');
    return;
  }
  cart.set(item.menuItemId, { item, quantity: newQty, notes: notes || (existing && existing.notes) || '' });
  show(msg, `Added ${quantity} × ${item.name} to your cart.`, 'success');
  updateCartBar();
}

function renderMenuItem(item) {
  const qtyInput = el('input', { type: 'number', min: '1', max: '10', value: '1', 'aria-label': `Quantity for ${item.name}` });
  const notesInput = el('input', { type: 'text', maxlength: '300', placeholder: 'Notes, e.g. no wasabi', 'aria-label': `Notes for ${item.name}` });
  return el('div', { class: 'menu-item' }, [
    el('div', { class: 'name', text: (item.code ? item.code + ' · ' : '') + item.name }),
    el('div', { class: 'desc', text: item.description }),
    el('div', { class: 'price', text: session && session.isAyce ? 'Included (AYCE)' : money(item.price) }),
    item.isAvailable
      ? el('div', {}, [
          el('div', { class: 'row' }, [qtyInput, notesInput]),
          el('button', {
            class: 'primary', type: 'button', text: 'Add to cart',
            onclick: () => {
              const qty = Number(qtyInput.value);
              if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
                show(msg, 'Quantity must be a whole number from 1 to 10.', 'error');
                return;
              }
              addToCart(item, qty, notesInput.value.trim());
            },
          }),
        ])
      : el('div', { class: 'unavailable', text: 'Currently unavailable' }),
  ]);
}

async function loadMenu() {
  const params = new URLSearchParams();
  if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
  if (categorySelect.value) params.set('category', categorySelect.value);
  if (sortSelect.value) params.set('sort', sortSelect.value);
  try {
    const data = await api('/api/menu?' + params.toString());
    if (categorySelect.options.length === 1) {
      for (const name of data.categories) {
        categorySelect.append(el('option', { value: name, text: name }));
      }
    }
    const sections = [];
    for (const [category, items] of Object.entries(data.grouped)) {
      sections.push(el('section', { 'aria-label': category }, [
        el('h2', { text: category }),
        el('div', { class: 'menu-grid' }, items.map(renderMenuItem)),
      ]));
    }
    menuBox.replaceChildren(
      ...(sections.length ? sections : [el('p', { class: 'hint', text: 'No menu items match your search.' })])
    );
  } catch (err) {
    show(msg, err.message, 'error');
  }
}

function renderCartDialog() {
  const itemsBox = document.getElementById('cart-items');
  const totalBox = document.getElementById('cart-total');
  if (cart.size === 0) {
    itemsBox.replaceChildren(el('p', { class: 'hint', text: 'Your cart is empty.' }));
    totalBox.textContent = '';
    return;
  }
  itemsBox.replaceChildren(
    el('table', { class: 'data' }, [
      el('thead', {}, el('tr', {}, [
        el('th', { text: 'Item' }), el('th', { text: 'Qty' }), el('th', { text: 'Notes' }),
        el('th', { text: 'Price' }), el('th', { text: '' }),
      ])),
      el('tbody', {}, cartItems().map((entry) => {
        const qtyInput = el('input', {
          type: 'number', min: '1', max: '10', value: String(entry.quantity),
          'aria-label': `Quantity for ${entry.item.name}`,
          onchange: () => {
            const qty = Number(qtyInput.value);
            if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
              qtyInput.value = String(entry.quantity);
              return;
            }
            entry.quantity = qty;
            updateCartBar();
            renderCartDialog();
          },
        });
        return el('tr', {}, [
          el('td', { text: entry.item.name }),
          el('td', {}, qtyInput),
          el('td', { text: entry.notes || '—' }),
          el('td', { text: session && session.isAyce ? 'AYCE' : money(entry.item.price * entry.quantity) }),
          el('td', {}, el('button', {
            class: 'secondary', type: 'button', text: 'Remove',
            onclick: () => { cart.delete(entry.item.menuItemId); updateCartBar(); renderCartDialog(); },
          })),
        ]);
      })),
    ])
  );
  totalBox.textContent = session && session.isAyce
    ? 'All You Can Eat — no per-item charge.'
    : 'Total: ' + money(cartTotal());
}

async function submitOrder() {
  if (cart.size === 0) return;
  try {
    const result = await api('/api/orders', {
      method: 'POST',
      body: {
        sessionId: session.sessionId,
        items: cartItems().map((entry) => ({
          menuItemId: entry.item.menuItemId,
          quantity: entry.quantity,
          notes: entry.notes || undefined,
        })),
      },
    });
    cart.clear();
    updateCartBar();
    if (cartDialog.open) cartDialog.close();
    show(msg, `${result.message} (Order #${result.orderId})`, 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    show(msg, err.message, 'error');
  }
}

async function loadOrders() {
  const ordersBox = document.getElementById('orders');
  try {
    const orders = await api(`/api/sessions/${session.sessionId}/orders`);
    ordersBox.replaceChildren(
      ...(orders.length
        ? orders.map((o) => el('div', { class: 'card order-card' }, [
            el('div', { class: 'session-row' }, [
              el('h3', { text: `Order #${o.orderId}` }),
              el('span', { class: 'spacer' }),
              statusBadge(o.status),
            ]),
            el('p', { class: 'hint', text: 'Submitted ' + o.submittedAt }),
            el('ul', {}, o.items.map((item) => el('li', {}, [
              el('span', { text: `${item.quantity} × ${item.name}` }),
              item.notes ? el('div', { class: 'notes', text: 'Note: ' + item.notes }) : null,
            ]))),
          ]))
        : [el('p', { class: 'hint', text: 'No orders yet for this table.' })])
    );
  } catch (err) {
    show(msg, err.message, 'error');
  }
}

async function init() {
  if (!Number.isInteger(tableNumber)) {
    show(msg, 'Invalid table link. Please ask your server for help.', 'error');
    return;
  }
  document.getElementById('page-title').textContent = `🍣 Sushi Order — Table ${tableNumber}`;
  try {
    session = await api(`/api/table/${tableNumber}/session`);
    if (session.isAyce) {
      show(msg, 'This table is set to All You Can Eat. Order as you go — items have no per-item charge.', 'success');
    }
  } catch (err) {
    show(msg, err.message, 'error');
    document.getElementById('cart-bar').hidden = true;
    return;
  }
  loadMenu();
}

searchInput.addEventListener('input', () => loadMenu());
categorySelect.addEventListener('change', () => loadMenu());
sortSelect.addEventListener('change', () => loadMenu());
document.getElementById('filter-form').addEventListener('submit', (e) => e.preventDefault());
submitBtn.addEventListener('click', submitOrder);
document.getElementById('dialog-submit-btn').addEventListener('click', submitOrder);
document.getElementById('review-cart-btn').addEventListener('click', () => { renderCartDialog(); cartDialog.showModal(); });
document.getElementById('dialog-close-btn').addEventListener('click', () => cartDialog.close());
document.getElementById('view-orders-btn').addEventListener('click', () => {
  document.getElementById('menu-section').hidden = true;
  document.getElementById('orders-section').hidden = false;
  loadOrders();
});
document.getElementById('back-to-menu').addEventListener('click', () => {
  document.getElementById('orders-section').hidden = true;
  document.getElementById('menu-section').hidden = false;
});

init();
