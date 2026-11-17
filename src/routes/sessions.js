// Table and session management for Servers (FR-D1, FR-D3, FR-U9 to FR-U11).
const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware');

const router = express.Router();

// FR-D1: list restaurant tables, with whether each has an active session.
router.get('/tables', requireAuth, (req, res) => {
  const tables = db
    .prepare(
      `SELECT t.tableId, t.tableNumber, t.capacity,
              (SELECT COUNT(*) FROM TableSession s
                WHERE s.tableId = t.tableId AND s.endedAt IS NULL) AS activeSessions
         FROM RestaurantTable t
        ORDER BY t.tableNumber`
    )
    .all();
  res.json(tables);
});

// FR-U9: initialize a new table session.
router.post('/sessions', requireAuth, requireRole('server'), (req, res) => {
  const { tableNumber, customers, ayce } = req.body || {};
  const customerCount = Number(customers);
  if (!Number.isInteger(customerCount) || customerCount < 1 || customerCount > 20) {
    return res.status(400).json({ error: 'Please enter a customer count between 1 and 20.' });
  }
  const table = db
    .prepare('SELECT tableId, capacity FROM RestaurantTable WHERE tableNumber = ?')
    .get(Number(tableNumber));
  if (!table) return res.status(404).json({ error: 'That table does not exist.' });

  const existing = db
    .prepare('SELECT sessionId FROM TableSession WHERE tableId = ? AND endedAt IS NULL')
    .get(table.tableId);
  if (existing) {
    return res.status(409).json({ error: 'That table already has an active session.' });
  }

  const result = db
    .prepare(
      'INSERT INTO TableSession (tableId, serverId, customerCount, isAyce) VALUES (?, ?, ?, ?)'
    )
    .run(table.tableId, req.session.userId, customerCount, ayce ? 1 : 0);
  const created = db
    .prepare(
      `SELECT s.sessionId, t.tableNumber, s.customerCount, s.isAyce, s.startedAt, s.endedAt
         FROM TableSession s JOIN RestaurantTable t ON t.tableId = s.tableId
        WHERE s.sessionId = ?`
    )
    .get(result.lastInsertRowid);
  res.status(201).json(created);
});

// FR-U10: list active sessions with their orders.
router.get('/sessions', requireAuth, (req, res) => {
  const activeOnly = req.query.active !== 'false';
  const sessions = db
    .prepare(
      `SELECT s.sessionId, t.tableNumber, s.customerCount, s.isAyce, s.startedAt, s.endedAt,
              u.fullName AS serverName
         FROM TableSession s
         JOIN RestaurantTable t ON t.tableId = s.tableId
         JOIN UserAccount u ON u.userId = s.serverId
        WHERE (? = 0 OR s.endedAt IS NULL)
        ORDER BY s.startedAt DESC`
    )
    .all(activeOnly ? 1 : 0);

  const ordersStmt = db.prepare(
    `SELECT o.orderId, o.status, o.submittedAt,
            (SELECT COUNT(*) FROM OrderItem oi WHERE oi.orderId = o.orderId) AS itemCount,
            (SELECT ROUND(SUM(oi.quantity * m.price), 2)
               FROM OrderItem oi JOIN MenuItem m ON m.menuItemId = oi.menuItemId
              WHERE oi.orderId = o.orderId) AS total
       FROM CustomerOrder o
      WHERE o.sessionId = ?
      ORDER BY o.submittedAt DESC`
  );
  for (const s of sessions) {
    s.orders = ordersStmt.all(s.sessionId);
  }
  res.json(sessions);
});

// FR-U11: close a session; no further orders allowed.
router.patch('/sessions/:id/close', requireAuth, requireRole('server'), (req, res) => {
  const sessionId = Number(req.params.id);
  const session = db
    .prepare('SELECT sessionId, endedAt FROM TableSession WHERE sessionId = ?')
    .get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (session.endedAt) return res.status(409).json({ error: 'That session is already closed.' });
  db.prepare("UPDATE TableSession SET endedAt = datetime('now') WHERE sessionId = ?").run(sessionId);
  res.json({ ok: true });
});

module.exports = router;
