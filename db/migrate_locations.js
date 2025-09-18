// db/migrate_locations.js
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

function hasColumn(table, name) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${table})`, (err, rows) => {
      if (err) return reject(err);
      resolve(rows.some(r => r.name === name));
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

(async () => {
  try {
    // 1) 建 locations 表
    await run(`
      CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        prefixes TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      )
    `);

    // 2) orders 表補欄位
    if (!(await hasColumn('orders', 'location_id'))) {
      await run(`ALTER TABLE orders ADD COLUMN location_id INTEGER`);
    }
    if (!(await hasColumn('orders', 'location_name'))) {
      await run(`ALTER TABLE orders ADD COLUMN location_name TEXT`);
    }
    // order_id 唯一索引
    await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id)`);

    // 3) 預設兩個寄件地（A-D / E-H）
    const a = await get(`SELECT 1 FROM locations WHERE name='寄件地A'`);
    if (!a) await run(
      `INSERT INTO locations(name, prefixes, is_active) VALUES ('寄件地A','A,B,C,D',1)`
    );
    const b = await get(`SELECT 1 FROM locations WHERE name='寄件地B'`);
    if (!b) await run(
      `INSERT INTO locations(name, prefixes, is_active) VALUES ('寄件地B','E,F,G,H',1)`
    );

    console.log('✅ migrate_locations 完成');
  } catch (e) {
    console.error('❌ migrate_locations 失敗：', e.message);
  } finally {
    db.close();
  }
})();
