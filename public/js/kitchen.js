const msg = document.getElementById('msg');
const queueBox = document.getElementById('queue');

wireStaffHeader();

async function setStatus(orderId, status) {
  try {
    await api(`/api/orders/${orderId}/status`, { method: 'PATCH', body: { status } });
    refresh();
  } catch (err) {
    if (!requireLoginRedirect(err)) show(msg, err.message, 'error');
  }
}

function renderOrder(o) {
  const items = el('ul', {}, o.items.map((item) =>
    el('li', {}, [
      el('span', { text: `${item.quantity} × ${item.code ? item.code + ' ' : ''}${item.name}` }),
      item.notes ? el('div', { class: 'notes', text: 'Note: ' + item.notes }) : null,
    ])
  ));

  const actions = [];
  if (o.status === 'Pending') {
    actions.push(el('button', { class: 'primary', type: 'button', text: 'Start preparing', onclick: () => setStatus(o.orderId, 'In Progress') }));
    actions.push(el('button', { class: 'secondary', type: 'button', text: 'Cancel order', onclick: () => {
      if (window.confirm(`Cancel order #${o.orderId}?`)) setStatus(o.orderId, 'Cancelled');
    } }));
  } else if (o.status === 'In Progress') {
    actions.push(el('button', { class: 'primary', type: 'button', text: 'Mark completed', onclick: () => setStatus(o.orderId, 'Completed') }));
  }

  return el('div', { class: 'card order-card' }, [
    el('div', { class: 'session-row' }, [
      el('h3', { text: `Order #${o.orderId} — Table ${o.tableNumber}` }),
      o.isAyce ? el('span', { class: 'badge ayce', text: 'AYCE' }) : null,
      el('span', { class: 'spacer' }),
      statusBadge(o.status),
    ]),
    el('p', { class: 'hint', text: 'Submitted ' + o.submittedAt }),
    items,
    el('div', {}, actions),
  ]);
}

async function refresh() {
  try {
    const orders = await api('/api/kitchen/queue');
    queueBox.replaceChildren(
      ...(orders.length
        ? orders.map(renderOrder)
        : [el('p', { class: 'hint', text: 'No open orders. New orders appear here automatically.' })])
    );
  } catch (err) {
    if (!requireLoginRedirect(err)) show(msg, err.message, 'error');
  }
}

refresh();
setInterval(refresh, 5000);
