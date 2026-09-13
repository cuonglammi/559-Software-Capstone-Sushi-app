(() => {
  const queue = document.querySelector('#kitchen-queue');
  if (!queue) return;
  const status = document.querySelector('#poll-status');
  const snapshot = () => JSON.stringify(Array.from(queue.querySelectorAll('[data-order-id]')).map(el => [Number(el.dataset.orderId), el.dataset.status]));
  let current = snapshot();
  async function refresh() {
    try {
      const response = await fetch(queue.dataset.pollUrl, {headers: {'X-Background-Poll': '1'}, redirect: 'error'});
      if (!response.ok) throw new Error('Queue unavailable');
      const data = await response.json();
      const next = JSON.stringify(data.orders.filter(o => o.status !== 'cancelled').map(o => [o.id, o.status]));
      if (next !== current) {
        // Do not replace a control while a staff member is using it.
        if (queue.contains(document.activeElement)) {
          status.textContent = 'New updates · finish your action to refresh';
          return;
        }
        const page = await fetch(location.href, {headers: {'X-Background-Poll': '1'}, redirect: 'error'});
        if (!page.ok) throw new Error('Queue unavailable');
        const parsed = new DOMParser().parseFromString(await page.text(), 'text/html');
        const fresh = parsed.querySelector('#kitchen-queue');
        if (!fresh) throw new Error('Sign-in required');
        queue.replaceChildren(...fresh.childNodes);
        current = snapshot();
      }
      status.textContent = 'Live queue · up to date';
    } catch (_) {
      status.textContent = 'Updates paused · check connection or sign in again';
    } finally {
      window.setTimeout(refresh, 5000);
    }
  }
  window.setTimeout(refresh, 5000);
})();
