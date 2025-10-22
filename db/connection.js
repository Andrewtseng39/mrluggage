// db/connection.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('開啟資料庫失敗：', err);
  } else {
    console.log('SQLite 已連線：', dbPath);
    const init = require('./init'); // ✅ 這裡才 require
    init(db);                       // ✅ 傳同一個 db 進去
  }
});

module.exports = db;
