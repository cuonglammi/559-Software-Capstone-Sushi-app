// Authentication and profile routes (FR-A1 to FR-A4, FR-P1, FR-P2).
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth } = require('../middleware');
const { validatePassword } = require('../validation');

const router = express.Router();

// FR-A1: login with unique username and password.
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  const user = db
    .prepare('SELECT userId, username, passwordHash, fullName, role FROM UserAccount WHERE username = ?')
    .get(username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    // Controlled error, no detail about which part failed (NFR-1).
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  // NFR-6: regenerate the session on privilege change to prevent fixation.
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Unable to log in - please try again.' });
    req.session.userId = user.userId;
    req.session.role = user.role;
    req.session.lastActivity = Date.now();
    res.json({ userId: user.userId, username: user.username, fullName: user.fullName, role: user.role });
  });
});

router.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// FR-P1: view own profile (full name and role).
router.get('/profile', requireAuth, (req, res) => {
  const user = db
    .prepare('SELECT userId, username, fullName, role FROM UserAccount WHERE userId = ?')
    .get(req.session.userId);
  if (!user) return res.status(404).json({ error: 'Profile not found.' });
  res.json(user);
});

// FR-P2: update own full name.
router.patch('/profile', requireAuth, (req, res) => {
  const { fullName } = req.body || {};
  if (typeof fullName !== 'string' || fullName.trim().length === 0 || fullName.length > 100) {
    return res.status(400).json({ error: 'Please enter a valid full name.' });
  }
  db.prepare('UPDATE UserAccount SET fullName = ? WHERE userId = ?').run(fullName.trim(), req.session.userId);
  res.json({ ok: true, fullName: fullName.trim() });
});

// FR-A3: change own password securely. FR-A2: policy enforced. NFR-3: bcrypt with salt.
router.patch('/profile/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return res.status(400).json({ error: 'Current and new password are required.' });
  }
  const user = db
    .prepare('SELECT passwordHash FROM UserAccount WHERE userId = ?')
    .get(req.session.userId);
  if (!user || !bcrypt.compareSync(currentPassword, user.passwordHash)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }
  const check = validatePassword(newPassword);
  if (!check.valid) {
    return res.status(400).json({ error: check.errors.join(' ') });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE UserAccount SET passwordHash = ? WHERE userId = ?').run(hash, req.session.userId);
  res.json({ ok: true });
});

module.exports = router;
