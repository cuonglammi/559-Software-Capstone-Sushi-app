// Database setup for the Sushi Order Application.
// Uses Node's built-in node:sqlite with prepared statements throughout (NFR-2).
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'sushi.db');

const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');

// Schema follows the Milestone 4 ERD:
// UserAccount, RestaurantTable, TableSession, CustomerOrder, MenuCategory, MenuItem, OrderItem
db.exec(`
CREATE TABLE IF NOT EXISTS UserAccount (
  userId        INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  passwordHash  TEXT NOT NULL,
  fullName      TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('server', 'kitchen'))
);

CREATE TABLE IF NOT EXISTS RestaurantTable (
  tableId      INTEGER PRIMARY KEY AUTOINCREMENT,
  tableNumber  INTEGER NOT NULL UNIQUE,
  capacity     INTEGER NOT NULL CHECK (capacity > 0)
);

CREATE TABLE IF NOT EXISTS TableSession (
  sessionId      INTEGER PRIMARY KEY AUTOINCREMENT,
  tableId        INTEGER NOT NULL REFERENCES RestaurantTable(tableId),
  serverId       INTEGER NOT NULL REFERENCES UserAccount(userId),
  customerCount  INTEGER NOT NULL CHECK (customerCount > 0),
  isAyce         INTEGER NOT NULL DEFAULT 0,
  startedAt      TEXT NOT NULL DEFAULT (datetime('now')),
  endedAt        TEXT
);

CREATE TABLE IF NOT EXISTS MenuCategory (
  categoryId    INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL UNIQUE,
  displayOrder  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS MenuItem (
  menuItemId   INTEGER PRIMARY KEY AUTOINCREMENT,
  categoryId   INTEGER NOT NULL REFERENCES MenuCategory(categoryId),
  code         TEXT,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  price        REAL NOT NULL CHECK (price >= 0),
  imageUrl     TEXT,
  isAvailable  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS CustomerOrder (
  orderId      INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId    INTEGER NOT NULL REFERENCES TableSession(sessionId),
  status       TEXT NOT NULL DEFAULT 'Pending'
               CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Cancelled')),
  submittedAt  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS OrderItem (
  orderItemId  INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId      INTEGER NOT NULL REFERENCES CustomerOrder(orderId),
  menuItemId   INTEGER NOT NULL REFERENCES MenuItem(menuItemId),
  quantity     INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  notes        TEXT,
  prepStatus   TEXT NOT NULL DEFAULT 'Pending'
               CHECK (prepStatus IN ('Pending', 'In Progress', 'Ready'))
);
`);

module.exports = db;
