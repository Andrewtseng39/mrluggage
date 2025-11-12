// db/init.js
const bcrypt = require('bcrypt');

module.exports = async function init(db) {
  try {
    await run(db, 'BEGIN TRANSACTION');

    // =============== orders ===============
    await run(db, `
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id     TEXT NOT NULL UNIQUE,
        name         TEXT NOT NULL,
        phone        TEXT NOT NULL,
        small_count  INTEGER DEFAULT 0,
        large_count  INTEGER DEFAULT 0,
        total_count  INTEGER DEFAULT 0,
        invoice_type TEXT,
        total_price  INTEGER NOT NULL,
        created_at   TEXT
      )
    `);

    // 補齊 orders 缺少欄位
    await ensureColumn(db, 'orders', 'carrier_number', 'TEXT');
    await ensureColumn(db, 'orders', 'is_archived', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn(db, 'orders', 'archived_at', 'TEXT');
    await ensureColumn(db, 'orders', 'email', 'TEXT');
    await ensureColumn(db, 'orders', 'location_id', 'INTEGER');
    await ensureColumn(db, 'orders', 'location_name', 'TEXT');

    // 列印狀態欄位
    await ensureColumn(db, 'orders', 'print_count', 'INTEGER DEFAULT 0');
    await ensureColumn(db, 'orders', 'first_print_at', 'TEXT');
    await ensureColumn(db, 'orders', 'last_print_at', 'TEXT');
    await ensureColumn(db, 'orders', 'last_print_by', 'TEXT');
    await run(db, 'UPDATE orders SET print_count = COALESCE(print_count, 0)');

    // 索引
    await run(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id)`);
    await run(db, `CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)`);
    await run(db, `CREATE INDEX IF NOT EXISTS idx_orders_is_archived ON orders(is_archived)`);

    console.log('orders 檢查完成 ✅');

    // =============== locations ===============
    await run(db, `
      CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        prefixes TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT,
        updated_at TEXT
      )
    `);

    const locCnt = await get(db, `SELECT COUNT(1) AS cnt FROM locations`);
    if ((locCnt?.cnt || 0) === 0) {
      const now = nowTW();
      const defaultLocations = [
        { name: '寄件地A', prefixes: 'A,B,C,D' },
        { name: '寄件地B', prefixes: 'E,F,G,H' }
      ];

      for (const loc of defaultLocations) {
        await run(db,
          `INSERT INTO locations (name, prefixes, is_active, created_at, updated_at)
           VALUES (?, ?, 1, ?, ?)`,
          [loc.name, loc.prefixes, now, now]
        );
      }
      console.log('已建立預設 locations ✅');
    }
    console.log('locations 檢查完成 ✅');

    // =============== admins ===============
    await run(db, `
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username  TEXT UNIQUE NOT NULL,
        password  TEXT NOT NULL,
        created_at TEXT
      )
    `);

    const adminCnt = await get(db, `SELECT COUNT(1) AS cnt FROM admins`);
    if ((adminCnt?.cnt || 0) === 0) {
      const hashedPassword = await bcrypt.hash('123456', 10);
      await run(db, 
        `INSERT INTO admins (username, password, created_at) VALUES (?,?,?)`,
        ['admin', hashedPassword, nowTW()]
      );
      console.log('已建立預設管理員：帳號 admin / 密碼 123456 ✅');
    }
    console.log('admins 檢查完成 ✅');

    await run(db, 'COMMIT');
    console.log('DB init done ✅');
  } catch (e) {
    await run(db, 'ROLLBACK').catch(() => {});
    console.error('[DB init] 失敗：', e.message || e);
    throw e;
  }
};

// ---------- Helpers ----------
function ensureColumn(db, table, colName, colType) {
  // 驗證表名和欄位名
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
    throw new Error(`無效的表名: ${table}`);
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(colName)) {
    throw new Error(`無效的欄位名: ${colName}`);
  }

  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${table})`, (err, cols) => {
      if (err) return reject(err);
      const exists = Array.isArray(cols) && cols.some(c => c.name === colName);
      if (exists) {
        console.log(`欄位已存在：${table}.${colName}`);
        return resolve();
      }
      
      db.run(`ALTER TABLE ${table} ADD COLUMN ${colName} ${colType}`, (e) => {
        if (e) {
          if (e.message.includes('duplicate column')) {
            console.log(`欄位已存在：${table}.${colName}`);
            return resolve();
          }
          console.error(`新增欄位失敗(${table}.${colName})：`, e.message);
          return reject(e);
        }
        console.log(`已新增欄位：${table}.${colName} ${colType}`);
        resolve();
      });
    });
  });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function get(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, function (err, row) {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function nowTW() {
  const d = new Date();
  const offset = 8 * 60; // UTC+8
  const localTime = new Date(d.getTime() + offset * 60 * 1000);
  return localTime.toISOString().slice(0, 19).replace('T', ' ');
}