// db/init.js
module.exports = function init(db) {
  (async () => {
    try {
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

      // 補齊 orders 缺少欄位（含列印相關）
      await ensureColumn(db, 'orders', 'carrier_number TEXT');
      await ensureColumn(db, 'orders', 'is_archived INTEGER NOT NULL DEFAULT 0');
      await ensureColumn(db, 'orders', 'archived_at TEXT');
      await ensureColumn(db, 'orders', 'email TEXT');
      await ensureColumn(db, 'orders', 'location_id INTEGER');
      await ensureColumn(db, 'orders', 'location_name TEXT');

      // 🔶 列印狀態欄位（關鍵四欄）
      await ensureColumn(db, 'orders', 'print_count INTEGER DEFAULT 0');
      await ensureColumn(db, 'orders', 'first_print_at TEXT');
      await ensureColumn(db, 'orders', 'last_print_at TEXT');
      await ensureColumn(db, 'orders', 'last_print_by TEXT');
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
          prefixes TEXT NOT NULL,     -- 例如：'A,B,C,D'
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT,
          updated_at TEXT
        )
      `);

      const locCnt = await get(db, `SELECT COUNT(1) AS cnt FROM locations`);
      if ((locCnt?.cnt || 0) === 0) {
        const now = nowTW();
        await run(
          db,
          `INSERT INTO locations (name, prefixes, is_active, created_at, updated_at)
           VALUES (?, ?, 1, ?, ?), (?, ?, 1, ?, ?)`,
          ['寄件地A','A,B,C,D', now, now, '寄件地B','E,F,G,H', now, now]
        );
        console.log('已建立預設 locations：寄件地A(A-D)、寄件地B(E-H) ✅');
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
        await run(db, `INSERT INTO admins (username, password, created_at) VALUES (?,?,?)`,
          ['admin', '123456', nowTW()]);
        console.log('已建立預設管理員：帳號 admin / 密碼 123456 ✅');
      }
      console.log('admins 檢查完成 ✅');

      console.log('DB init done ✅');
      // ⚠️ 不要 db.close()：這是共用連線，由 connection.js 管
    } catch (e) {
      console.error('[DB init] 失敗：', e.message || e);
    }
  })();
};

// ---------- Helpers ----------
function ensureColumn(db, table, colDef) {
  const colName = colDef.split(/\s+/)[0];
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${table})`, (err, cols) => {
      if (err) return reject(err);
      const exists = Array.isArray(cols) && cols.some(c => c.name === colName);
      if (exists) return resolve();
      db.run(`ALTER TABLE ${table} ADD COLUMN ${colDef}`, (e) => {
        if (e) {
          console.warn(`新增欄位失敗(${table}.${colName})：`, e.message);
          return resolve(); // 不中斷流程
        }
        console.log(`已新增欄位：${table}.${colDef}`);
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
  // 轉台灣時區的簡單寫法（資料庫仍用字串）
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.toISOString().replace('T',' ').slice(0,19);
}