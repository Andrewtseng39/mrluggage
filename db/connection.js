// db/connection.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// ==============================
// 1) 路徑策略：環境變數優先
//    - 本機：預設 ./data/concert.sqlite（請把 /data 加到 .gitignore）
//    - 正式機（Render）：DB_DIR 設為掛載的磁碟路徑，例如 /var/data
// ==============================
const DB_DIR  = process.env.DB_DIR  || path.resolve(process.cwd(), 'data');
const DB_FILE = process.env.DB_FILE || 'concert.sqlite';
const DB_PATH = path.join(DB_DIR, DB_FILE);

// 2) 確保資料夾存在
fs.mkdirSync(DB_DIR, { recursive: true });

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ 開啟資料庫失敗：', err);
    return;
  }

  console.log(`✅ SQLite 已連線：${DB_PATH}`);

  db.serialize(() => {
    // 3) PRAGMA 基本設定
    db.run('PRAGMA journal_mode = WAL;');
    db.run('PRAGMA foreign_keys = ON;');
    db.run('PRAGMA busy_timeout = 5000;');

    // 4) 列出實際開啟的 DB（用來確認真的在持久化磁碟上）
    db.each('PRAGMA database_list;', (i, r) => {
      console.log('[DB] database_list:', r);
    });
  });

  // 5) 初始化（注意 init.js 內不要有 DROP/DELETE/FORCE SYNC）
  const init = require('./init');
  init(db);
});

module.exports = db;
