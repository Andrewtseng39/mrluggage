// db/connection.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// 直接指定「有資料的那顆」DB 路徑
const dbPath = 'C:\\Users\\andre\\OneDrive\\Desktop\\concert-luggage-system\\database.db';

// 確保資料夾存在（通常已存在，保險起見）
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('開啟資料庫失敗：', err);
  } else {
    console.log('✅ SQLite 已連線：', dbPath);

    // 基本 PRAGMA（可留可不留）
    db.serialize(() => {
      db.run(`PRAGMA journal_mode = WAL;`);
      db.run(`PRAGMA foreign_keys = ON;`);
      db.run(`PRAGMA busy_timeout = 5000;`);
    });

    const init = require('./init'); // 初始化（建表等）
    init(db);
  }
});

module.exports = db;
