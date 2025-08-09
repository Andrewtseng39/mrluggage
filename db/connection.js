// db/addColumns.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/database.db');

db.serialize(() => {
  db.run(`ALTER TABLE orders ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('加欄位 is_archived 錯誤:', err.message);
    } else {
      console.log('已新增欄位 is_archived ✅');
    }
  });

  db.run(`ALTER TABLE orders ADD COLUMN archived_at TEXT`, (err) => {
    if (err && !err.message.includes('duplicate column')) {
      console.error('加欄位 archived_at 錯誤:', err.message);
    } else {
      console.log('已新增欄位 archived_at ✅');
    }
  });
});

db.close();
