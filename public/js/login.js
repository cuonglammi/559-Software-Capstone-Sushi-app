const form = document.getElementById('login-form');
const msg = document.getElementById('msg');

if (new URLSearchParams(window.location.search).get('expired')) {
  show(msg, 'Your session expired due to inactivity. Please log in again.', 'error');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hide(msg);
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  if (!username || !password) {
    show(msg, 'Please enter your username and password.', 'error');
    return;
  }
  try {
    const user = await api('/api/auth/login', { method: 'POST', body: { username, password } });
    window.location.href = user.role === 'kitchen' ? '/kitchen.html' : '/dashboard.html';
  } catch (err) {
    show(msg, err.message, 'error');
  }
});
