// Seeds the database with the shared test data from the Milestone 4 testing plan
// (TD-01 to TD-06) plus a fuller menu. Safe to run repeatedly.
const bcrypt = require('bcryptjs');
const db = require('./db');

function seed() {
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM UserAccount').get().n;
  if (userCount > 0) {
    console.log('Database already seeded; skipping.');
    return;
  }

  const insertUser = db.prepare(
    'INSERT INTO UserAccount (username, passwordHash, fullName, role) VALUES (?, ?, ?, ?)'
  );
  // TD-01 / TD-02 shared test accounts from the proposal's testing plan.
  insertUser.run('server01', bcrypt.hashSync('Srvr@123', 10), 'Sam Rivera', 'server');
  insertUser.run('kitchen01', bcrypt.hashSync('Kitch3n@123', 10), 'Kai Tanaka', 'kitchen');

  const insertTable = db.prepare(
    'INSERT INTO RestaurantTable (tableNumber, capacity) VALUES (?, ?)'
  );
  // TD-03: table 12 / capacity 4, plus others for a realistic floor.
  for (const [num, cap] of [[1, 2], [2, 2], [3, 4], [4, 4], [5, 2], [6, 6], [7, 4], [8, 8], [12, 4]]) {
    insertTable.run(num, cap);
  }

  const insertCategory = db.prepare(
    'INSERT INTO MenuCategory (name, displayOrder) VALUES (?, ?)'
  );
  const categories = {};
  for (const [i, name] of ['Appetizers', 'Nigiri', 'Rolls', 'Beverages'].entries()) {
    categories[name] = insertCategory.run(name, i).lastInsertRowid;
  }

  const insertItem = db.prepare(
    `INSERT INTO MenuItem (categoryId, code, name, description, price, imageUrl, isAvailable)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const menu = [
    ['Appetizers', 'A1', 'Edamame', 'Steamed soybeans with sea salt', 4.5, null, 1],
    ['Appetizers', 'A2', 'Gyoza', 'Pan-fried pork dumplings, five pieces', 6.99, null, 1],
    ['Appetizers', 'A3', 'Miso Soup', 'Classic soybean broth with tofu and wakame', 3.5, null, 1],
    ['Appetizers', 'A4', 'Agedashi Tofu', 'Fried tofu in warm dashi broth', 5.75, null, 1],
    ['Nigiri', 'N1', 'Tuna Nigiri', 'Fresh bluefin tuna over seasoned rice, two pieces', 5.49, null, 1],
    ['Nigiri', 'N2', 'Ebi Nigiri', 'Butterflied cooked shrimp, two pieces', 4.99, null, 1],
    ['Nigiri', 'N3', 'Salmon Nigiri', 'Atlantic salmon over seasoned rice, two pieces', 5.99, null, 1],
    ['Nigiri', 'N4', 'Unagi Nigiri', 'Grilled freshwater eel with sweet tare, two pieces', 6.49, null, 0],
    ['Rolls', 'R1', 'California Roll', 'Crab, avocado and cucumber, eight pieces', 8.99, null, 1],
    ['Rolls', 'R2', 'Spicy Tuna Roll', 'Tuna with spicy mayo and cucumber, eight pieces', 9.49, null, 1],
    ['Rolls', 'R3', 'Dragon Roll', 'Shrimp tempura topped with eel and avocado', 12.99, null, 1],
    ['Rolls', 'R4', 'Salmon Avocado Roll', 'Fresh salmon and avocado, eight pieces', 9.99, null, 1],
    ['Beverages', 'B1', 'Ramune', 'Japanese marble soda, original flavour', 3.75, null, 1],
    ['Beverages', 'B2', 'Green Tea', 'Hot sencha green tea', 2.5, null, 1],
    ['Beverages', 'B3', 'Sparkling Water', 'Chilled sparkling mineral water', 2.95, null, 1],
  ];
  for (const [cat, code, name, desc, price, img, avail] of menu) {
    insertItem.run(categories[cat], code, name, desc, price, img, avail);
  }

  console.log('Seeded users, tables, categories and menu items.');
}

seed();

if (require.main === module) {
  // run directly via `npm run seed`
}

module.exports = seed;
