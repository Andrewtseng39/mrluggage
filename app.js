const db = require('./db/connection');
const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const app = express();

// 設定靜態檔案目錄
app.use(express.static(path.join(__dirname, 'public')));
// 🔽 新增這行，讓專案根目錄的 uploads/ 可以被瀏覽器存取
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 設定模板引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 解析 POST 資料
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 印完才記錄列印
app.post('/admin/printed/:order_id', async (req, res) => {
  const { order_id } = req.params;
  const who = (req.session?.admin?.email) || 'unknown';
  const now = new Date().toISOString();

  const existing = await db.get('SELECT first_print_at FROM orders WHERE order_id = ?', [order_id]);
  await db.run(`
    UPDATE orders
    SET print_count   = COALESCE(print_count, 0) + 1,
        first_print_at= COALESCE(first_print_at, ?),
        last_print_at = ?,
        last_print_by = ?
    WHERE order_id = ?
  `, [now, now, who, order_id]);

  res.json({ ok: true });
});


// ✅ 加入 session middleware（一定要放在路由之前）
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.sqlite',
    dir: path.join(__dirname, 'db'),
    table: 'sessions_v2'   // ← 換新表名，會自動 CREATE 正確欄位：sid, expired, sess
  }),
  secret: 'replace-with-your-own-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// 路由設定
const customerRoutes = require('./routes/customer');
const adminRoutes = require('./routes/admin');

app.use('/', customerRoutes);
app.use('/admin', adminRoutes);

// 404 處理
app.use((req, res) => {
  res.status(404).send('頁面不存在');
});

// 錯誤處理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('系統發生錯誤');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`伺服器運行在 http://localhost:${PORT}`);
  console.log(`管理後台：http://localhost:${PORT}/admin`);
});

module.exports = app;
