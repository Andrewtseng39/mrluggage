// db/addColumns.js
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// 和你平常用的 DB 檔一致
const DB_PATH = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(DB_PATH);

function ensureColumn(table, colDef, cb) {
  const [colName] = colDef.split(/\s+/); // 取欄位名稱
  db.all(`PRAGMA table_info(${table})`, (err, cols) => {
    if (err) return cb(err);
    const exists = cols.some(c => c.name === colName);
    if (exists) {
      console.log(`欄位已存在，略過：${colName}`);
      return cb(null);
    }
    db.run(`ALTER TABLE ${table} ADD COLUMN ${colDef}`, (e) => {
      if (e) return cb(e);
      console.log(`已新增欄位：${colDef}`);
      cb(null);
    });
  });
}

db.serialize(() => {
  ensureColumn('orders', 'is_archived INTEGER NOT NULL DEFAULT 0', (e1) => {
    if (e1) console.error('新增 is_archived 失敗：', e1.message);
    ensureColumn('orders', 'archived_at TEXT', (e2) => {
      if (e2) console.error('新增 archived_at 失敗：', e2.message);
      db.close(() => console.log('完成 ✅'));
    });
  });
});
