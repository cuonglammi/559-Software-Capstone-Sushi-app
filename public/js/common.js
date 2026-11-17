// Shared helpers. All dynamic text is inserted via textContent, never innerHTML
// with user data, so user-generated content cannot execute as markup (NFR-4).

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON response */ }
  if (!res.ok) {
    const message = (data && data.error) || 'Something went wrong - please try again.';
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

function show(el, message, kind) {
  el.textContent = message;
  el.className = 'alert ' + kind;
  el.hidden = false;
}

function hide(el) { el.hidden = true; }

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child != null) node.append(child);
  }
  return node;
}

function money(value) {
  return '$' + Number(value).toFixed(2);
}

function statusBadge(status) {
  const map = { Pending: 'pending', 'In Progress': 'inprogress', Completed: 'completed', Cancelled: 'cancelled' };
  return el('span', { class: 'badge ' + (map[status] || 'pending'), text: status });
}

async function wireStaffHeader() {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
      window.location.href = '/login.html';
    });
  }
}

// Redirect staff pages to login when the API says the session is gone.
function requireLoginRedirect(err) {
  if (err.status === 401) {
    window.location.href = '/login.html?expired=1';
    return true;
  }
  return false;
}
