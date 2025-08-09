// db/init.js
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'database.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('DB 連線失敗：', err.message);
  else console.log('DB 連線成功（init）✅ 路徑：', DB_PATH);
});

function ensureColumn(table, colDef) {
  return new Promise((resolve) => {
    const colName = colDef.split(/\s+/)[0];
    db.all(`PRAGMA table_info(${table})`, (err, cols) => {
      if (err) { console.error(err.message); return resolve(); }
      if (cols.some(c => c.name === colName)) return resolve();
      db.run(`ALTER TABLE ${table} ADD COLUMN ${colDef}`, (e) => {
        if (e) console.warn(`新增欄位失敗(${colName})：`, e.message);
        else console.log(`已新增欄位：${colDef}`);
        resolve();
      });
    });
  });
}

db.serialize(async () => {
  // 建表（若已存在不會更動欄位）
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT UNIQUE,
      name TEXT,
      phone TEXT,
      small_count INTEGER,
      large_count INTEGER,
      total_count INTEGER,
      invoice_type TEXT,
      total_price INTEGER,
      created_at TEXT
    )
  `);

  // 確保缺的欄位補齊
  await ensureColumn('orders', 'carrier_number TEXT');
  await ensureColumn('orders', 'is_archived INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('orders', 'archived_at TEXT');

  // 索引
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_is_archived ON orders(is_archived)`);

  console.log('DB init done ✅');
  db.close();
});
