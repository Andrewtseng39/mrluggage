// db/connection.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// ✅ 確保先跑一次 init，補齊表和欄位
require('./init');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('開啟資料庫失敗：', err);
  } else {
    console.log('SQLite 已連線：', dbPath);
  }
});

module.exports = db;
