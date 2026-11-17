const msg = document.getElementById('msg');

wireStaffHeader();

async function load() {
  try {
    const profile = await api('/api/profile');
    document.getElementById('p-username').textContent = profile.username;
    document.getElementById('p-role').textContent = profile.role === 'kitchen' ? 'Kitchen Staff' : 'Server';
    document.getElementById('full-name').value = profile.fullName;
  } catch (err) {
    if (!requireLoginRedirect(err)) show(msg, err.message, 'error');
  }
}

document.getElementById('name-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  hide(msg);
  try {
    const fullName = document.getElementById('full-name').value;
    await api('/api/profile', { method: 'PATCH', body: { fullName } });
    show(msg, 'Your name has been updated.', 'success');
  } catch (err) {
    if (!requireLoginRedirect(err)) show(msg, err.message, 'error');
  }
});

document.getElementById('password-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  hide(msg);
  try {
    await api('/api/profile/password', {
      method: 'PATCH',
      body: {
        currentPassword: document.getElementById('current-password').value,
        newPassword: document.getElementById('new-password').value,
      },
    });
    show(msg, 'Your password has been changed.', 'success');
    document.getElementById('password-form').reset();
  } catch (err) {
    if (!requireLoginRedirect(err)) show(msg, err.message, 'error');
  }
});

load();
