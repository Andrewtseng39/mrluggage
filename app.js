const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');

app.set('trust proxy', 1); // 在 Railway 這種代理後面建議開啟

app.use(
  session({
    store: new SQLiteStore({
      // 在雲端用 Volume：/data；本機則落到專案 db 目錄
      dir: process.env.SESSION_DIR || path.join(__dirname, 'db'),
      db: 'sessions.sqlite'
    }),
    secret: process.env.SESSION_SECRET || 'mySecretKey',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 60 * 60 * 1000,          // 1 小時
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production' // Railway 走 HTTPS 時會自動設為 true
    },
    name: 'sid' // 可自訂 cookie 名稱
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
