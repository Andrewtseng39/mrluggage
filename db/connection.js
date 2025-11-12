// db/connection.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// ==== 設定資料夾與檔案路徑 ====
const DB_DIR  = process.env.DB_DIR  || path.resolve(process.cwd(), 'data');
const DB_FILE = process.env.DB_FILE || 'concert.sqlite';
const DB_PATH = path.join(DB_DIR, DB_FILE);

// 確保資料夾存在
try {
  fs.mkdirSync(DB_DIR, { recursive: true });
} catch (err) {
  console.error('❌ 無法建立資料夾：', err);
  process.exit(1);
}

let db;
let isReady = false;
const waitQueue = [];

// 初始化資料庫
const initPromise = new Promise((resolve, reject) => {
  db = new sqlite3.Database(DB_PATH, async (err) => {
    if (err) {
      console.error('❌ 開啟資料庫失敗：', err);
      reject(err);
      return;
    }

    console.log(`✅ SQLite 已連線：${DB_PATH}`);

    try {
      // === PRAGMA 優化設定 ===
      await new Promise((res, rej) => {
        db.serialize(() => {
          db.exec(`
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;
            PRAGMA busy_timeout = 8000;
            PRAGMA wal_autocheckpoint = 1000;
            PRAGMA temp_store = MEMORY;
            PRAGMA cache_size = -20000;
          `, (e) => {
            if (e) rej(e);
            else res();
          });
        });
      });

      // 顯示連線資訊（開發模式）
      if (process.env.NODE_ENV === 'development') {
        db.each('PRAGMA database_list;', (err, row) => {
          if (!err) console.log('[DB] database_list:', row);
        });
      }

      // === 執行初始化 ===
      const init = require('./init');
      await init(db);

      isReady = true;
      console.log('✅ 資料庫初始化完成');

      // 通知等待的請求
      waitQueue.forEach(cb => cb());
      waitQueue.length = 0;

      resolve(db);
    } catch (initErr) {
      console.error('❌ 資料庫初始化失敗：', initErr);
      reject(initErr);
    }
  });
});

// 優雅關閉
function closeDatabase() {
  if (db) {
    db.close((err) => {
      if (err) console.error('❌ 關閉 DB 失敗:', err);
      else console.log('✅ DB 已關閉');
      process.exit(err ? 1 : 0);
    });
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', closeDatabase);
process.on('SIGTERM', closeDatabase);

// 導出包裝過的 db，確保初始化完成才能使用
module.exports = new Proxy(() => {}, {
  get(target, prop) {
    if (prop === 'ready') {
      return initPromise;
    }
    if (prop === 'isReady') {
      return isReady;
    }
    if (!db) {
      throw new Error('資料庫尚未初始化');
    }
    const value = db[prop];
    if (typeof value === 'function') {
      return value.bind(db);
    }
    return value;
  },
  has(target, prop) {
    return db ? prop in db : false;
  },
  ownKeys(target) {
    return db ? Reflect.ownKeys(db) : [];
  },
  getOwnPropertyDescriptor(target, prop) {
    return db ? Object.getOwnPropertyDescriptor(db, prop) : undefined;
  }
});
