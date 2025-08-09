const express = require('express');
const session = require('express-session');
const BetterSqlite3Store = require('better-sqlite3-session-store')(session);
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();

// 基本中介層
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 視圖引擎（如果你用 EJS）
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// 本機端：不信任 proxy
app.set('trust proxy', false);

// 確保本機資料夾存在
const dbDir = path.join(__dirname, 'db');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

// 本機端固定使用本機路徑
const sessionDbPath = path.join(dbDir, 'sessions.sqlite');
const sessionDb = new Database(sessionDbPath);

// 本機端 session 設定（只留這一段！）
app.use(
  session({
    store: new BetterSqlite3Store({
      client: sessionDb,
      expired: { clear: true, intervalMs: 15 * 60 * 1000 }, // 15 分鐘清一次
    }),
    secret: 'devOnlySecret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,               // 本機 http 必須 false
      maxAge: 60 * 60 * 1000,      // 1 小時
    },
    name: 'sid',
  })
);

// 靜態檔案（若有）
app.use(express.static(path.join(__dirname, 'public')));

// 路由
const customerRoutes = require('./routes/customer');
const adminRoutes = require('./routes/admin');
app.use('/', customerRoutes);
app.use('/admin', adminRoutes);

// 啟動
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`本機伺服器已啟動：http://localhost:${PORT}`);
});
