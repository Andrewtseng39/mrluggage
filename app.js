// app.js
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');

const app = express();

// 若之後部署在 Railway/反向代理，建議打開 trust proxy
app.set('trust proxy', 1);

// EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 靜態資源
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));

// Session（改用環境變數；本機沒設就用預設值）
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'mySecretKey',
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 60 * 60 * 1000, // 1 小時
      // 之後上 Railway 若用 HTTPS，可加 secure: true
    },
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
