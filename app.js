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

// session middleware
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

// ✅ 新增:資料庫準備檢查 middleware
app.use((req, res, next) => {
  if (!db.isReady) {
    // 如果資料庫還沒準備好,等待它
    db.ready
      .then(() => next())
      .catch(err => {
        console.error('資料庫初始化失敗:', err);
        res.status(503).send('系統正在啟動中,請稍後再試');
      });
  } else {
    next();
  }
});

// 路由設定
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

// ✅ 關鍵改動:等資料庫準備好才啟動伺服器
db.ready
  .then(() => {
    app.listen(PORT, () => {
      console.log(`伺服器運行在 http://localhost:${PORT}`);
      console.log(`管理後台: http://localhost:${PORT}/admin`);
    });
  })
  .catch(err => {
    console.error('❌ 啟動失敗:', err);
    process.exit(1);
  });

module.exports = app;