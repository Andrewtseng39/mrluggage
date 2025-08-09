const session = require('express-session');
const BetterSqlite3Store = require('better-sqlite3-session-store')(session);
const Database = require('better-sqlite3');
const path = require('path');

app.set('trust proxy', 1);

// 創建 session 資料庫
const sessionDbPath = path.join(process.env.SESSION_DIR || path.join(__dirname, 'db'), 'sessions.sqlite');
const sessionDb = new Database(sessionDbPath);

app.use(
  session({
    store: new BetterSqlite3Store({
      client: sessionDb,
      expired: {
        clear: true,
        intervalMs: 900000 // 15 分鐘清理一次過期 session
      }
    }),
    secret: process.env.SESSION_SECRET || 'mySecretKey',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 60 * 60 * 1000,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    },
    name: 'sid'
  })
);

// 路由
const customerRoutes = require('./routes/customer');
const adminRoutes = require('./routes/admin');

app.use('/', customerRoutes);
app.use('/admin', adminRoutes);

// 啟動伺服器：使用雲端埠號或預設 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`伺服器已啟動，監聽埠號 ${PORT}`);
});