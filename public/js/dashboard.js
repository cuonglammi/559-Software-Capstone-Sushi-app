const msg = document.getElementById('msg');
const sessionsBox = document.getElementById('sessions');
const tableSelect = document.getElementById('table-select');

wireStaffHeader();

async function loadTables() {
  try {
    const tables = await api('/api/tables');
    tableSelect.replaceChildren(
      ...tables.map((t) =>
        el('option', {
          value: t.tableNumber,
          text: `Table ${t.tableNumber} (seats ${t.capacity})${t.activeSessions ? ' — in use' : ''}`,
          ...(t.activeSessions ? { disabled: 'disabled' } : {}),
        })
      )
    );
  } catch (err) {
    if (!requireLoginRedirect(err)) show(msg, err.message, 'error');
  }
}

function renderSession(s) {
  const header = el('div', { class: 'session-row' }, [
    el('h3', { text: `Table ${s.tableNumber}` }),
    s.isAyce ? el('span', { class: 'badge ayce', text: 'AYCE' }) : null,
    el('span', { class: 'hint', text: `${s.customerCount} guests · opened ${s.startedAt} · ${s.serverName}` }),
    el('span', { class: 'spacer' }),
    el('button', {
      class: 'danger',
      type: 'button',
      text: 'Close session',
      onclick: async () => {
        if (!window.confirm(`Close the session for table ${s.tableNumber}? Customers will no longer be able to order.`)) return;
        try {
          await api(`/api/sessions/${s.sessionId}/close`, { method: 'PATCH' });
          show(msg, `Session for table ${s.tableNumber} closed.`, 'success');
          refresh();
        } catch (err) {
          if (!requireLoginRedirect(err)) show(msg, err.message, 'error');
        }
      },
    }),
  ]);

  let ordersContent;
  if (s.orders.length === 0) {
    ordersContent = el('p', { class: 'hint', text: 'No orders yet.' });
  } else {
    ordersContent = el('table', { class: 'data' }, [
      el('thead', {}, el('tr', {}, [
        el('th', { text: 'Order' }),
        el('th', { text: 'Items' }),
        el('th', { text: 'Total' }),
        el('th', { text: 'Status' }),
        el('th', { text: 'Submitted' }),
      ])),
      el('tbody', {}, s.orders.map((o) =>
        el('tr', {}, [
          el('td', { text: '#' + o.orderId }),
          el('td', { text: String(o.itemCount) }),
          el('td', { text: s.isAyce ? 'AYCE' : money(o.total || 0) }),
          el('td', {}, statusBadge(o.status)),
          el('td', { text: o.submittedAt }),
        ])
      )),
    ]);
  }

  return el('div', { class: 'card' }, [header, ordersContent]);
}

async function refresh() {
  try {
    const sessions = await api('/api/sessions?active=true');
    sessionsBox.replaceChildren(
      ...(sessions.length
        ? sessions.map(renderSession)
        : [el('p', { class: 'hint', text: 'No active sessions. Open one above to get started.' })])
    );
    loadTables();
  } catch (err) {
    if (!requireLoginRedirect(err)) show(msg, err.message, 'error');
  }
}

document.getElementById('session-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  hide(msg);
  try {
    const created = await api('/api/sessions', {
      method: 'POST',
      body: {
        tableNumber: Number(tableSelect.value),
        customers: Number(document.getElementById('customers').value),
        ayce: document.getElementById('ayce').value === 'true',
      },
    });
    show(msg, `Session opened for table ${created.tableNumber}. Customers can now order at /t/${created.tableNumber}.`, 'success');
    refresh();
  } catch (err) {
    if (!requireLoginRedirect(err)) show(msg, err.message, 'error');
  }
});

refresh();
setInterval(refresh, 10000);
