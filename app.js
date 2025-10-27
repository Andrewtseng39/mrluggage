const db = require('./db/connection');
const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const { ensureLogin } = require('./middlewares/auth');

const app = express();

// 設定靜態檔案目錄
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 設定模板引擎
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 解析 POST 資料
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ✅ session middleware 必須放在路由之前
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.sqlite',
    dir: path.join(__dirname, 'db'),
    table: 'sessions_v2'
  }),
  secret: 'replace-with-your-own-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// ✅ 路由放在 session 之後
// 印完才記錄列印（需登入）
app.post('/admin/printed/:order_id', ensureLogin, (req, res) => {
  const { order_id } = req.params;
  const who = (req.session?.admin?.email) || 'unknown';
  const now = new Date().toISOString();

  db.run(
    `
    UPDATE orders SET 
      print_count   = COALESCE(print_count, 0) + 1,
      first_print_at = COALESCE(first_print_at, ?),
      last_print_at  = ?,
      last_print_by  = ?
    WHERE order_id = ?
    `,
    [now, now, who, order_id],
    function (err) {
      if (err) return res.status(500).json({ ok: false, error: err.message });
      return res.json({ ok: true, changes: this.changes });
    }
  );
});

const { exportAcpay } = require('./routes/admin-export-acpay');
app.get('/admin/export_acpay', ensureLogin, exportAcpay);

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
  console.log(`管理後台:http://localhost:${PORT}/admin`);
});

module.exports = app;