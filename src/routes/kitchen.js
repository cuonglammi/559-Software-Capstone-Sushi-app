// Kitchen queue and order status routes (FR-U12 to FR-U14).
const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware');
const { canTransition, ORDER_STATUSES } = require('../validation');

const router = express.Router();

// FR-U12: real-time queue of open orders across all tables (polled by the UI).
router.get('/kitchen/queue', requireAuth, (req, res) => {
  const orders = db
    .prepare(
      `SELECT o.orderId, o.status, o.submittedAt, t.tableNumber, s.isAyce
         FROM CustomerOrder o
         JOIN TableSession s ON s.sessionId = o.sessionId
         JOIN RestaurantTable t ON t.tableId = s.tableId
        WHERE o.status IN ('Pending', 'In Progress')
        ORDER BY o.submittedAt ASC`
    )
    .all();
  const itemsStmt = db.prepare(
    `SELECT oi.quantity, oi.notes, m.name, m.code
       FROM OrderItem oi JOIN MenuItem m ON m.menuItemId = oi.menuItemId
      WHERE oi.orderId = ?`
  );
  for (const o of orders) o.items = itemsStmt.all(o.orderId);
  res.json(orders);
});

// FR-U13 / FR-U14: move an order through its lifecycle with validated transitions.
router.patch('/orders/:id/status', requireAuth, (req, res) => {
  const { status } = req.body || {};
  if (!ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Unknown order status.' });
  }
  const order = db
    .prepare('SELECT orderId, status FROM CustomerOrder WHERE orderId = ?')
    .get(Number(req.params.id));
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (!canTransition(order.status, status)) {
    return res.status(409).json({
      error: `Cannot change an order from "${order.status}" to "${status}".`,
    });
  }
  db.prepare('UPDATE CustomerOrder SET status = ? WHERE orderId = ?').run(status, order.orderId);
  res.json({ ok: true, orderId: order.orderId, status });
});

module.exports = router;
