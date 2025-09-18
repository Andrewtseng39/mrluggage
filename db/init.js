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
        if (e) console.warn(`新增欄位失敗(${table}.${colName})：`, e.message);
        else console.log(`已新增欄位：${table}.${colDef}`);
        resolve();
      });
    });
  });
}

db.serialize(async () => {
  // =============== orders ===============
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

  // 補齊 orders 缺少欄位
  await ensureColumn('orders', 'carrier_number TEXT');
  await ensureColumn('orders', 'is_archived INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('orders', 'archived_at TEXT');
  await ensureColumn('orders', 'email TEXT');
  await ensureColumn('orders', 'location_id INTEGER');
  await ensureColumn('orders', 'location_name TEXT');

  // 索引
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_orders_is_archived ON orders(is_archived)`);

  console.log('orders 檢查完成 ✅');

  // =============== locations ===============
  db.run(`
    CREATE TABLE IF NOT EXISTS locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      prefixes TEXT NOT NULL,     -- 例如：'A,B,C,D'
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT,
      updated_at TEXT
    )
  `, (err) => {
    if (err) {
      console.error('建立 locations 失敗：', err.message);
    } else {
      console.log('locations 檢查完成 ✅');
      // 空表則塞入示範資料
      db.get(`SELECT COUNT(1) AS cnt FROM locations`, (e2, row) => {
        if (e2) {
          console.warn('檢查 locations 失敗：', e2.message);
          proceedAdmins();
          return;
        }
        if ((row?.cnt || 0) === 0) {
          const now = new Date(Date.now() + 8*3600*1000).toISOString().replace('T',' ').slice(0,19);
          db.run(
            `INSERT INTO locations (name, prefixes, is_active, created_at, updated_at)
             VALUES 
             (?, ?, 1, ?, ?),
             (?, ?, 1, ?, ?)`,
            [
              '寄件地A', 'A,B,C,D', now, now,
              '寄件地B', 'E,F,G,H', now, now
            ],
            (e3) => {
              if (e3) console.warn('寫入預設 locations 失敗：', e3.message);
              else    console.log('已建立預設 locations：寄件地A(A-D)、寄件地B(E-H) ✅');
              proceedAdmins();
            }
          );
        } else {
          proceedAdmins();
        }
      });
    }
  });

  // =============== admins ===============
  function proceedAdmins() {
    db.run(`
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TEXT
      )
    `, (err) => {
      if (err) {
        console.error('建立 admins 失敗：', err.message);
        return finish();
      }
      console.log('admins 檢查完成 ✅');

      // 空表時建立預設管理員
      db.get(`SELECT COUNT(1) AS cnt FROM admins`, (e2, row) => {
        if (e2) {
          console.warn('檢查 admins 失敗：', e2.message);
          return finish();
        }
        if ((row?.cnt || 0) === 0) {
          const now = new Date(Date.now() + 8*3600*1000).toISOString().replace('T',' ').slice(0,19);
          db.run(
            `INSERT INTO admins (username, password, created_at) VALUES (?,?,?)`,
            ['admin', '123456', now],
            (e3) => {
              if (e3) console.warn('建立預設管理員失敗：', e3.message);
              else    console.log('已建立預設管理員：帳號 admin / 密碼 123456 ✅');
              finish();
            }
          );
        } else {
          finish();
        }
      });
    });
  }

  function finish() {
    console.log('DB init done ✅');
    db.close();
  }
});
