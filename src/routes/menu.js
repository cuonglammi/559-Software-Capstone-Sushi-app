// Customer-facing menu and ordering routes (FR-U1 to FR-U8).
// These are table-scoped and do not require staff login: customers access the
// app from a table-specific URL once a Server has opened a session.
const express = require('express');
const db = require('../db');
const { isValidQuantity, filterSortMenu } = require('../validation');

const router = express.Router();

// FR-U1 to FR-U4: menu grouped by category with search, filter and sort.
router.get('/menu', (req, res) => {
  const rows = db
    .prepare(
      `SELECT m.menuItemId, m.code, m.name, m.description, m.price, m.imageUrl,
              m.isAvailable, c.name AS category, c.displayOrder
         FROM MenuItem m JOIN MenuCategory c ON c.categoryId = m.categoryId
        ORDER BY c.displayOrder, m.code`
    )
    .all();

  const { search, category, sort } = req.query;
  const filtered = filterSortMenu(rows, { search, category, sort });

  const grouped = {};
  for (const item of filtered) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }
  const categories = db
    .prepare('SELECT name FROM MenuCategory ORDER BY displayOrder')
    .all()
    .map((c) => c.name);
  res.json({ categories, grouped, items: filtered });
});

// Resolve the active session for a table so the customer UI can attach orders to it.
router.get('/table/:tableNumber/session', (req, res) => {
  const table = db
    .prepare('SELECT tableId, tableNumber FROM RestaurantTable WHERE tableNumber = ?')
    .get(Number(req.params.tableNumber));
  if (!table) return res.status(404).json({ error: 'That table does not exist.' });
  const session = db
    .prepare(
      `SELECT sessionId, customerCount, isAyce, startedAt
         FROM TableSession WHERE tableId = ? AND endedAt IS NULL`
    )
    .get(table.tableId);
  if (!session) {
    return res.status(404).json({ error: 'No active session for this table. Please ask your server.' });
  }
  res.json({ tableNumber: table.tableNumber, ...session });
});

// FR-U7 / FR-U8: submit the cart as an order against an active session.
router.post('/orders', (req, res) => {
  const { sessionId, items } = req.body || {};
  const session = db
    .prepare('SELECT sessionId, endedAt FROM TableSession WHERE sessionId = ?')
    .get(Number(sessionId));
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (session.endedAt) {
    return res.status(409).json({ error: 'This table session is closed. Please ask your server.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Your cart is empty.' });
  }
  if (items.length > 50) {
    return res.status(400).json({ error: 'Too many items in one order.' });
  }

  const itemStmt = db.prepare(
    'SELECT menuItemId, isAvailable FROM MenuItem WHERE menuItemId = ?'
  );
  for (const entry of items) {
    if (!isValidQuantity(Number(entry.quantity))) {
      return res.status(400).json({ error: 'Quantities must be whole numbers from 1 to 10.' });
    }
    if (entry.notes != null && String(entry.notes).length > 300) {
      return res.status(400).json({ error: 'Notes must be 300 characters or fewer.' });
    }
    const menuItem = itemStmt.get(Number(entry.menuItemId));
    if (!menuItem || !menuItem.isAvailable) {
      return res.status(400).json({ error: 'One of the items is unavailable. Please refresh the menu.' });
    }
  }

  const insertOrder = db.prepare('INSERT INTO CustomerOrder (sessionId) VALUES (?)');
  const insertItem = db.prepare(
    'INSERT INTO OrderItem (orderId, menuItemId, quantity, notes) VALUES (?, ?, ?, ?)'
  );
  const orderId = insertOrder.run(session.sessionId).lastInsertRowid;
  for (const entry of items) {
    insertItem.run(orderId, Number(entry.menuItemId), Number(entry.quantity), entry.notes ? String(entry.notes) : null);
  }

  // FR-U8: confirmation payload shown on the customer interface.
  res.status(201).json({
    ok: true,
    orderId: Number(orderId),
    message: 'Your order has been sent to the kitchen!',
  });
});

// Let customers see the status of orders for their session.
router.get('/sessions/:id/orders', (req, res) => {
  const sessionId = Number(req.params.id);
  const orders = db
    .prepare(
      `SELECT orderId, status, submittedAt FROM CustomerOrder
        WHERE sessionId = ? ORDER BY submittedAt DESC`
    )
    .all(sessionId);
  const itemsStmt = db.prepare(
    `SELECT oi.quantity, oi.notes, m.name, m.price
       FROM OrderItem oi JOIN MenuItem m ON m.menuItemId = oi.menuItemId
      WHERE oi.orderId = ?`
  );
  for (const o of orders) o.items = itemsStmt.all(o.orderId);
  res.json(orders);
});

module.exports = router;
