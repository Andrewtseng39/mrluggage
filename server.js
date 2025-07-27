const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./database');
const QRCode = require('qrcode');
const fs = require('fs');
const cron = require('node-cron');
const { format } = require('@fast-csv/format');
const nodemailer = require('nodemailer'); // ★ 新增 nodemailer

const app = express();
const PORT = 3000;

// 修正後的時間處理函數
function getLocalTime(date = new Date()) {
  // 直接返回本地時間，不要重複加時區
  return date;
}

function getLocalISOString(date = new Date()) {
  // 轉換為台灣時間的 ISO 字串 (UTC+8)
  const taiwanDate = new Date(date.getTime() + (8 * 60 * 60 * 1000));
  return taiwanDate.toISOString().replace('T', ' ').slice(0, 19);
}

// 獲取台灣今日日期字串 (YYYY-MM-DD)
function getTaiwanToday() {
  const now = new Date();
  // 直接加 8 小時轉換為台灣時間
  const taiwanTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const yyyy = taiwanTime.getUTCFullYear();
  const mm = String(taiwanTime.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(taiwanTime.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// 生成訂單編號函數
function generateOrderNo(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ★ 美化的 Email HTML 模板函數
function generateOrderEmailHTML(orderData) {
  const { order_no, name, phone, checkin_at, checkout_at, big_count, small_count, amount } = orderData;
  
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>訂單確認 - 行李寄存服務</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: 'Microsoft JhengHei', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #f8f9fa;
        }
        
        .email-container {
            max-width: 600px;
            margin: 20px auto;
            background-color: #ffffff;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px 20px;
            text-align: center;
        }
        
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 600;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        
        .header .icon {
            font-size: 48px;
            margin-bottom: 10px;
            display: block;
        }
        
        .content {
            padding: 40px 30px;
        }
        
        .order-info {
            background-color: #f8f9ff;
            border-left: 4px solid #667eea;
            padding: 25px;
            margin: 20px 0;
            border-radius: 8px;
        }
        
        .info-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding: 10px 0;
            border-bottom: 1px solid #e9ecef;
        }
        
        .info-row:last-child {
            border-bottom: none;
            margin-bottom: 0;
        }
        
        .info-label {
            font-weight: 600;
            color: #495057;
            min-width: 120px;
            display: flex;
            align-items: center;
        }
        
        .info-value {
            color: #212529;
            font-weight: 500;
            text-align: right;
            flex: 1;
        }
        
        .luggage-details {
            background-color: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        
        .luggage-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }
        
        .luggage-item:last-child {
            margin-bottom: 0;
        }
        
        .total-amount {
            background: linear-gradient(135deg, #28a745, #20c997);
            color: white;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            margin: 25px 0;
            box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3);
        }
        
        .total-amount .amount {
            font-size: 32px;
            font-weight: 700;
            margin-top: 5px;
        }
        
        .footer {
            background-color: #f8f9fa;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #dee2e6;
        }
        
        .footer p {
            margin: 10px 0;
            color: #6c757d;
            font-size: 14px;
        }
        
        .status-badge {
            background-color: #28a745;
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            display: inline-block;
            margin: 15px 0;
        }
        
        .icon-text {
            margin-right: 8px;
        }
        
        @media (max-width: 600px) {
            .email-container {
                margin: 10px;
                border-radius: 8px;
            }
            
            .content {
                padding: 20px 15px;
            }
            
            .order-info {
                padding: 15px;
            }
            
            .info-row {
                flex-direction: column;
                align-items: flex-start;
            }
            
            .info-value {
                text-align: left;
                margin-top: 5px;
            }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <!-- Header -->
        <div class="header">
            <span class="icon">🧳</span>
            <h1>預訂確認成功</h1>
            <div class="status-badge">✓ 預訂完成</div>
        </div>
        
        <!-- Content -->
        <div class="content">
            <p style="font-size: 16px; color: #495057; margin-bottom: 25px;">
                親愛的顧客，感謝您選擇我們的行李寄存服務！以下是您的訂單詳情：
            </p>
            
            <!-- Order Information -->
            <div class="order-info">
                <div class="info-row">
                    <div class="info-label">
                        <span class="icon-text">📋</span>訂單編號
                    </div>
                    <div class="info-value">${order_no}</div>
                </div>
                
                <div class="info-row">
                    <div class="info-label">
                        <span class="icon-text">👤</span>姓名
                    </div>
                    <div class="info-value">${name}</div>
                </div>
                
                <div class="info-row">
                    <div class="info-label">
                        <span class="icon-text">📞</span>聯絡電話
                    </div>
                    <div class="info-value">${phone}</div>
                </div>
                
                <div class="info-row">
                    <div class="info-label">
                        <span class="icon-text">📅</span>寄存時間
                    </div>
                    <div class="info-value">${checkin_at}</div>
                </div>
                
                <div class="info-row">
                    <div class="info-label">
                        <span class="icon-text">🕐</span>取件時間
                    </div>
                    <div class="info-value">${checkout_at}</div>
                </div>
            </div>
            
            <!-- Luggage Details -->
            <div class="luggage-details">
                <h3 style="margin: 0 0 15px 0; color: #856404; display: flex; align-items: center;">
                    <span class="icon-text">🎒</span>行李明細
                </h3>
                <div class="luggage-item">
                    <span>大件行李</span>
                    <span style="font-weight: 600; color: #856404;">${big_count} 件</span>
                </div>
                <div class="luggage-item">
                    <span>小件行李</span>
                    <span style="font-weight: 600; color: #856404;">${small_count} 件</span>
                </div>
            </div>
            
            <!-- Total Amount -->
            <div class="total-amount">
                <div style="font-size: 16px; margin-bottom: 5px;">總金額</div>
                <div class="amount">NT$ ${amount}</div>
            </div>
            
            <!-- Important Notice -->
            <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 20px; margin: 25px 0;">
                <h4 style="margin: 0 0 10px 0; color: #856404;">📌 重要提醒</h4>
                <ul style="margin: 0; padding-left: 20px; color: #856404;">
                    <li>請於指定時間內完成行李寄存與取件</li>
                    <li>取件時請出示訂單編號與身分證件</li>
                    <li>如需更改時間，請提前聯繫客服</li>
                </ul>
            </div>
        </div>
        
        <!-- Footer -->
        <div class="footer">
            <p><strong>客服專線：</strong> 0932-253-266</p>
            <p><strong>營業時間：</strong> 週一至週日 08:00-22:00</p>
            <p style="font-size: 12px; color: #adb5bd; margin-top: 20px;">
                此為系統自動發送的確認信件，請勿直接回覆此郵件
            </p>
        </div>
    </div>
</body>
</html>`;
}

// 設定 EJS 模板
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 靜態檔案
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true }));

// Session 設定
app.use(session({
  secret: 'luggage-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 60 * 60 * 1000 } // 1 小時
}));

// Middleware: 登入檢查
function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect('/login');
  next();
}

// Middleware: 限制 Staff 只能看自己部門
function limitToDepartment(req, res, next) {
  if (!req.session || !req.session.user) return res.redirect('/login');
  if (req.session.user.role === 'Admin') return next();
  req.departmentFilter = req.session.user.department_id;
  next();
}

// 讓所有 EJS 可存取 session
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// 首頁
app.get('/', (req, res) => res.redirect('/dashboard'));

// 登入頁
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('login', { error: null });
});

// 登入驗證
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT s.*, d.name AS department_name
          FROM staff s
          LEFT JOIN departments d ON s.department_id = d.id
          WHERE s.username = ?`,
    [username],
    (err, user) => {
      if (!user) return res.render('login', { error: '帳號不存在' });
      if (!bcrypt.compareSync(password, user.password))
        return res.render('login', { error: '密碼錯誤' });

      const isAdmin = (user.username === 'admin') || ((user.role || '').toLowerCase() === 'admin');
      req.session.user = {
        id: user.id,
        username: user.username,
        real_name: user.real_name,
        role: user.role,
        department_id: user.department_id,
        department_name: user.department_name,
        isAdmin
      };

      console.log('登入後 session：', req.session.user);
      res.redirect('/dashboard');
    }
  );
});

// 登出
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// 儀表板
app.get('/dashboard', requireLogin, (req, res) => {
  const todayStr = getTaiwanToday(); // 使用台灣日期
  const stats = { toPickup: 0, picked: 0, missingCount: 0, overdue: [] };

  console.log(`台灣現在時間: ${new Date(new Date().getTime() + (8 * 60 * 60 * 1000)).toISOString()}`);
  console.log(`儀表板查詢日期: ${todayStr}`);

  // 1) 今日應領件：checkout_at 是今天且未領取的行李
  db.get(`
    SELECT COUNT(*) AS count
    FROM luggages l
    JOIN orders o ON l.order_id = o.id
    WHERE l.picked_at IS NULL
      AND DATE(o.checkout_at) = ?
  `, [todayStr], (err1, row1) => {
    if (err1) console.error('今日應領件查詢錯誤:', err1);
    stats.toPickup = row1 ? row1.count : 0;

    // 2) 今日已領件：picked_at 是今天
    db.get(`
      SELECT COUNT(*) AS count
      FROM luggages
      WHERE picked_at IS NOT NULL
        AND DATE(picked_at) = ?
    `, [todayStr], (err2, row2) => {
      if (err2) console.error('今日已領件查詢錯誤:', err2);
      stats.picked = row2 ? row2.count : 0;

      // 3) 未盤點件：今天沒有 inventory_scans
      db.get(`
        SELECT COUNT(*) AS count
        FROM luggages l
        WHERE l.picked_at IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM inventory_scans i
            WHERE i.luggage_id = l.id
              AND DATE(i.scanned_at) = ?
          )
      `, [todayStr], (err3, row3) => {
        if (err3) console.error('未盤點件查詢錯誤:', err3);
        stats.missingCount = row3 ? row3.count : 0;

        // 4) 逾時未領件：checkout_at 已過
        db.all(`
          SELECT o.order_no, o.name, o.checkin_at, o.checkout_at, l.code, l.size
          FROM luggages l
          JOIN orders o ON l.order_id = o.id
          WHERE l.picked_at IS NULL
            AND datetime(o.checkout_at) < datetime('now', '+8 hours')
          ORDER BY o.checkout_at ASC
        `, [], (err4, overdue) => {
          if (err4) console.error('逾時未領查詢錯誤:', err4);

          const now = getLocalTime();
          overdue = (overdue || []).map(o => {
            const feeInfo = calculateStorageFee({
              bigCount: o.size === 'big' ? 1 : 0,
              smallCount: o.size === 'small' ? 1 : 0,
              checkin_at: o.checkin_at,
              checkout_at: o.checkout_at,
              actual_pickup: now
            });
            return { ...o, overdue_days: feeInfo.actualDays, overdue_fee: feeInfo.extraFee };
          });

          res.render('dashboard', {
            user: req.session.user,
            today: todayStr,
            ...stats,
            overdue
          });
        });
      });
    });
  });
});


// 訂單列表
app.get('/orders', requireLogin, limitToDepartment, (req, res) => {
  const search = `%${req.query.q || ''}%`;
  let sql = `
    SELECT o.*, d.name AS dept_name
    FROM orders o
    LEFT JOIN departments d ON d.id = o.department_id
    WHERE (o.name LIKE ? OR o.phone LIKE ? OR o.order_no LIKE ?)
  `;
  const params = [search, search, search];

  if (req.session.user.role !== 'Admin') {
    sql += ` AND o.department_id = ?`;
    params.push(req.departmentFilter);
  }

  sql += ` ORDER BY o.created_at DESC`;

  db.all(sql, params, (err, orders) => {
    if (err) return res.send("訂單查詢失敗：" + err.message);
    res.render('orders_list', { orders, query: req.query.q || '' });
  });
});

// 新增訂單頁面 - 這個路由在您的程式碼中遺漏了
app.get('/orders/new', requireLogin, (req, res) => {
  // 計算預設的寄存和取件時間
  const now = new Date();
  const taiwanNow = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  
  // 預設寄存時間：現在時間
  const defaultCheckin = taiwanNow.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM 格式
  
  // 預設取件時間：明天同一時間
  const tomorrow = new Date(taiwanNow.getTime() + (24 * 60 * 60 * 1000));
  const defaultCheckout = tomorrow.toISOString().slice(0, 16);
  
  res.render('new_order', { 
    error: null,
    defaultCheckin: defaultCheckin,
    defaultCheckout: defaultCheckout
  });
});
// 修正後的新增訂單提交路由
app.post('/orders/new', requireLogin, (req, res) => {
  const { name, phone, email, big_count, small_count, checkin_at, checkout_at } = req.body;

  // ★ 修正1: 確保數值轉換和驗證
  const bigCount = parseInt(big_count) || 0;
  const smallCount = parseInt(small_count) || 0;
  
  // 驗證必要欄位
  if (!name || !phone || (bigCount + smallCount) <= 0) {
    const now = new Date();
    const taiwanNow = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const defaultCheckin = taiwanNow.toISOString().slice(0, 16);
    const tomorrow = new Date(taiwanNow.getTime() + (24 * 60 * 60 * 1000));
    const defaultCheckout = tomorrow.toISOString().slice(0, 16);
    
    return res.render('new_order', { 
      error: '請填寫必要欄位並至少選擇一件行李',
      defaultCheckin: defaultCheckin,
      defaultCheckout: defaultCheckout
    });
  }

  // 直接使用輸入的日期時間，不要額外轉換
  const checkin = checkin_at || getLocalISOString();
  const checkout = checkout_at || getLocalISOString();

  // ★ 修正2: 使用正確的變數計算總天數
  const checkinDate = new Date(checkin);
  const checkoutDate = new Date(checkout);
  const diffTime = checkoutDate - checkinDate;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const total_days = diffDays > 0 ? diffDays : 1;

  console.log('訂單資料檢查:', {
    name, phone, email,
    bigCount, smallCount,
    checkin, checkout,
    total_days
  });

  db.all(`SELECT key, value FROM settings`, (err, settings) => {
    let price_big = 200, price_small = 150;
    settings.forEach(s => {
      if (s.key === 'price_big') price_big = parseInt(s.value);
      if (s.key === 'price_small') price_small = parseInt(s.value);
    });

    // ★ 修正3: 使用轉換後的數值計算金額
    const amount = (bigCount * price_big + smallCount * price_small) * total_days;
    const order_no = generateOrderNo(8);
    const now = getLocalISOString();

    console.log('費用計算:', {
      price_big, price_small,
      bigCount, smallCount,
      total_days, amount
    });

    // ★ 修正4: 確保傳入正確的數值
    db.run(`
      INSERT INTO orders (order_no, name, phone, email, big_count, small_count, checkin_at, checkout_at, total_days, amount, department_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [order_no, name, phone, email, bigCount, smallCount,
        checkin, checkout, total_days, amount, req.session.user.department_id, now, now],

      function (err2) {
        if (err2) {
          console.error('新增訂單失敗:', err2);
          const now = new Date();
          const taiwanNow = new Date(now.getTime() + (8 * 60 * 60 * 1000));
          const defaultCheckin = taiwanNow.toISOString().slice(0, 16);
          const tomorrow = new Date(taiwanNow.getTime() + (24 * 60 * 60 * 1000));
          const defaultCheckout = tomorrow.toISOString().slice(0, 16);
          
          return res.render('new_order', { 
            error: '訂單建立失敗，請重試：' + err2.message,
            defaultCheckin: defaultCheckin,
            defaultCheckout: defaultCheckout
          });
        }

        const orderId = this.lastID;
        console.log('訂單建立成功，ID:', orderId);

        // ★ 修正5: 使用正確的數值建立行李記錄
        for (let i = 1; i <= bigCount; i++) {
          db.run(`INSERT INTO luggages (order_id, code, size, created_at)
                  VALUES (?, ?, 'big', ?)`, 
                  [orderId, `${order_no}-B${i}`, now], 
                  (err) => {
                    if (err) console.error('建立大件行李失敗:', err);
                  });
        }
        for (let i = 1; i <= smallCount; i++) {
          db.run(`INSERT INTO luggages (order_id, code, size, created_at)
                  VALUES (?, ?, 'small', ?)`, 
                  [orderId, `${order_no}-S${i}`, now],
                  (err) => {
                    if (err) console.error('建立小件行李失敗:', err);
                  });
        }

        // 寄送確認信
        // ★ 寄送美化的 Email
if (email && email.trim() !== '' && email.includes('@')) {
  console.log(`準備寄送確認信給客戶: ${email}`);
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'mr.luggage.tw@gmail.com', // 你的 Gmail
    pass: 'lmnw diri xeop ntpa'       // 你的 Gmail 應用程式密碼
  }
});


  const emailHTML = generateOrderEmailHTML({
    order_no,
    name,
    phone,
    checkin_at: checkin,
    checkout_at: checkout,
    big_count,
    small_count,
    amount
  });

  const mailOptions = {
    from: 'mr.luggage.tw@gmail.com',
    to: email,
    subject: `Mr. Luggage 訂單確認 - ${order_no}`,
    html: emailHTML
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) console.error('❌ 寄信失敗:', error);
    else console.log('✅ 訂單確認信已發送:', info.response);
  });

        } else {
          console.log('⚠️ Email 欄位為空或格式錯誤，不寄送確認信:', email);
        }

        res.redirect(`/orders/${orderId}`);
      });
  });
});

// 訂單詳情頁
app.get('/orders/:id', requireLogin, limitToDepartment, (req, res) => {
  const id = req.params.id;
  db.get(`
    SELECT o.*, d.name AS dept_name
    FROM orders o
    LEFT JOIN departments d ON d.id = o.department_id
    WHERE o.id = ?`,
    [id],
    (err, order) => {
      if (!order) return res.send("找不到訂單");
      db.all(`SELECT * FROM luggages WHERE order_id = ?`, [id], async (err2, luggages) => {
        for (let l of luggages) {
          l.qrDataUrl = await QRCode.toDataURL(`http://localhost:3000/sign/${l.code}`);
        }
        res.render('order_detail', { order, luggages });
      });
    });
});

// 刪除訂單 (Admin)
app.post('/orders/:id/delete', requireLogin, (req, res) => {
  if (req.session.user.role !== 'Admin') return res.send("你沒有權限刪除訂單");
  const id = req.params.id;
  db.run(`DELETE FROM luggages WHERE order_id = ?`, [id], () => {
    db.run(`DELETE FROM orders WHERE id = ?`, [id], () => {
      res.redirect('/orders');
    });
  });
});

// 標記為已領取
app.post('/orders/:id/complete', requireLogin, (req, res) => {
  const id = req.params.id;
  const now = getLocalISOString();
  db.run(`UPDATE luggages SET picked_at = ? WHERE order_id = ? AND picked_at IS NULL`,
    [now, id],
    () => {
      db.run(`UPDATE orders SET signed_at = ? WHERE id = ?`, [now, id]);
      res.redirect(`/orders/${id}`);
    });
});

// 簽收頁 - 修改後的版本
app.get('/sign/:code', (req, res) => {
  const code = req.params.code;
  db.get(`
    SELECT l.*, o.name AS customer_name, o.order_no, o.phone, o.checkin_at, o.checkout_at, o.big_count, o.small_count
    FROM luggages l
    JOIN orders o ON l.order_id = o.id
    WHERE l.code = ?`, [code], (err, luggage) => {
    if (!luggage) return res.send("無效的行李碼");

    // ★ 檢查是否已經簽收
    if (luggage.picked_at) {
      // 如果已經簽收，顯示完成頁面
      return res.render('sign_completed', { 
        luggage,
        picked_at: luggage.picked_at
      });
    }

    // 如果未簽收，計算超時費並顯示簽收頁面
    const feeInfo = calculateStorageFee({
      bigCount: luggage.size === 'big' ? 1 : 0,
      smallCount: luggage.size === 'small' ? 1 : 0,
      checkin_at: luggage.checkin_at,
      checkout_at: luggage.checkout_at,
      actual_pickup: new Date()
    });

    res.render('sign_page', { luggage, feeInfo });
  });
});

// 簽收頁 - 修改後的版本
app.get('/sign/:code', (req, res) => {
  const code = req.params.code;
  db.get(`
    SELECT l.*, o.name AS customer_name, o.order_no, o.phone, o.checkin_at, o.checkout_at, o.big_count, o.small_count
    FROM luggages l
    JOIN orders o ON l.order_id = o.id
    WHERE l.code = ?`, [code], (err, luggage) => {
    if (!luggage) return res.send("無效的行李碼");

    if (luggage.picked_at) {
      return res.render('sign_completed', { 
        luggage,
        picked_at: luggage.picked_at
      });
    }

    const feeInfo = calculateStorageFee({
      bigCount: luggage.size === 'big' ? 1 : 0,
      smallCount: luggage.size === 'small' ? 1 : 0,
      checkin_at: luggage.checkin_at,
      checkout_at: luggage.checkout_at,
      actual_pickup: new Date()
    });

    res.render('sign_page', { luggage, feeInfo });
  });
});

// 簽收提交 - 修改後的版本
app.post('/sign/:code', (req, res) => {
  const code = req.params.code;
  const signatureImg = req.body.signature;
  const now = getLocalISOString();

  db.get(`SELECT * FROM luggages WHERE code = ?`, [code], (err, luggage) => {
    if (!luggage) return res.send("找不到行李");

    if (luggage.picked_at) {
      return res.send(`
        <div style="text-align: center; padding: 50px; font-family: sans-serif;">
          <h1 style="color: #28a745;">✅ 此行李已完成簽收</h1>
          <p>簽收時間: ${luggage.picked_at}</p>
          <p>無需重複操作</p>
        </div>
      `);
    }

    db.run(`UPDATE luggages SET picked_at = ? WHERE code = ?`, [now, code], (err) => {
      if (err) return res.send("簽收失敗：" + err.message);

      db.run(`UPDATE orders SET signed_at = ?, signature_img = ? WHERE id = ?`,
        [now, signatureImg, luggage.order_id], (err) => {
          if (err) console.error("更新訂單簽名失敗:", err);

          res.send(`
            <div style="text-align: center; padding: 50px; font-family: -apple-system, BlinkMacSystemFont, 'Microsoft JhengHei', sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; color: white;">
              <div style="background: rgba(255,255,255,0.95); color: #333; padding: 40px; border-radius: 20px; max-width: 500px; margin: 0 auto; box-shadow: 0 20px 40px rgba(0,0,0,0.1);">
                <div style="font-size: 80px; margin-bottom: 20px;">🎉</div>
                <h1 style="color: #27ae60; margin-bottom: 20px;">簽收完成</h1>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 12px; margin: 20px 0;">
                  <p><strong>行李編號:</strong> ${code}</p>
                  <p><strong>簽收時間:</strong> ${now}</p>
                </div>
                <p style="color: #666; margin-top: 30px;">感謝您的使用！</p>
              </div>
            </div>
          `);
        });
    });
  });
});

// 匯出 CSV (Admin)
app.get('/orders/export/csv', requireLogin, (req, res) => {
  if (req.session.user.role !== 'Admin') return res.send("只有 Admin 可以匯出資料");

  const ws = fs.createWriteStream(path.join(__dirname, 'exports', 'orders.csv'));
  const csvStream = format({ headers: true });

  csvStream.pipe(ws);
  db.all(`
    SELECT o.order_no, o.name, o.phone, o.email, o.amount, o.checkin_at, o.checkout_at
    FROM orders o
    ORDER BY o.created_at DESC
  `, (err, rows) => {
    rows.forEach(r => csvStream.write(r));
    csvStream.end();
    ws.on('finish', () => {
      res.download(path.join(__dirname, 'exports', 'orders.csv'));
    });
  });
});

// 手動備份下載 (Admin)
app.get('/backup/download', requireLogin, (req, res) => {
  if (req.session.user.role !== 'Admin') return res.send('只有 Admin 可以下載備份');
  const dbPath = path.join(__dirname, 'luggage.db');
  res.download(dbPath, `luggage_backup_${Date.now()}.db`);
});

// 員工管理
app.get('/staff', requireLogin, (req, res) => {
  if (req.session.user.role !== 'Admin') return res.send("只有 Admin 可以管理員工");
  const search = `%${req.query.q || ''}%`;
  db.all(`
    SELECT s.*, d.name AS department_name
    FROM staff s
    LEFT JOIN departments d ON s.department_id = d.id
    WHERE s.username LIKE ? OR s.real_name LIKE ? OR d.name LIKE ?
    ORDER BY s.created_at DESC
  `, [search, search, search], (err, staff) => {
    res.render('staff_list', { staff, query: req.query.q || '' });
  });
});

app.get('/staff/new', requireLogin, (req, res) => {
  if (req.session.user.role !== 'Admin') return res.send("只有 Admin 可以新增員工");
  db.all(`SELECT * FROM departments`, (err, departments) => {
    res.render('staff_new', { departments, error: null });
  });
});

app.post('/staff/new', requireLogin, (req, res) => {
  if (req.session.user.role !== 'Admin') return res.send("只有 Admin 可以新增員工");
  const { username, password, real_name, department_id, role } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  const now = getLocalISOString();
  db.run(`INSERT INTO staff (username, password, real_name, department_id, role, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [username, hash, real_name, department_id, role, now],
    (err) => {
      if (err) return res.render('staff_new', { departments: [], error: '新增失敗，帳號可能已存在' });
      res.redirect('/staff');
    });
});

app.post('/staff/:id/delete', requireLogin, (req, res) => {
  if (req.session.user.role !== 'Admin') return res.send("只有 Admin 可以刪除員工");
  const id = req.params.id;
  db.run(`DELETE FROM staff WHERE id = ?`, [id], () => res.redirect('/staff'));
});

app.get('/staff/:id/edit', requireLogin, (req, res) => {
  if (req.session.user.role !== 'Admin') return res.send("只有 Admin 可以編輯員工");
  const id = req.params.id;
  db.get(`SELECT * FROM staff WHERE id = ?`, [id], (err, staff) => {
    if (!staff) return res.send("找不到該員工");
    db.all(`SELECT * FROM departments`, (err2, departments) => {
      res.render('staff_edit', { staff, departments, error: null });
    });
  });
});

app.post('/staff/:id/edit', requireLogin, (req, res) => {
  if (req.session.user.role !== 'Admin') return res.send("只有 Admin 可以編輯員工");
  const id = req.params.id;
  const { username, password, real_name, department_id, role } = req.body;

  let query = `UPDATE staff SET username = ?, real_name = ?, department_id = ?, role = ?`;
  let params = [username, real_name, department_id, role, id];

  if (password && password.trim() !== '') {
    const hash = bcrypt.hashSync(password, 10);
    query = `UPDATE staff SET username = ?, real_name = ?, department_id = ?, role = ?, password = ? WHERE id = ?`;
    params = [username, real_name, department_id, role, hash, id];
  } else {
    query += ` WHERE id = ?`;
  }

  db.run(query, params, (err) => {
    if (err) {
      return res.render('staff_edit', { staff: { id, username, real_name, department_id, role }, departments: [], error: '更新失敗' });
    }
    res.redirect('/staff');
  });
});

// 盤點作業頁面
app.get('/inventory/scan', requireLogin, (req, res) => {
  res.render('inventory_scan', { message: null });
});

// 盤點提交
app.post('/inventory/scan', requireLogin, (req, res) => {
  const { code } = req.body;
  db.get(`
    SELECT l.id AS luggage_id, l.code, o.order_no
    FROM luggages l
    JOIN orders o ON l.order_id = o.id
    WHERE l.code = ?`, [code], (err, luggage) => {
    if (!luggage) return res.render('inventory_scan', { message: '找不到行李編號：' + code });

    const now = getLocalISOString();
    db.run(`
      INSERT INTO inventory_scans (luggage_id, staff_id, scanned_at)
      VALUES (?, ?, ?)`,
      [luggage.luggage_id, req.session.user.id, now], (err2) => {
        if (err2) console.error(err2);
        res.render('inventory_scan', { message: `盤點完成：${luggage.code}` });
      });
  });
});
// 計算行李寄存費用與超時費
function calculateStorageFee({ bigCount, smallCount, checkin_at, checkout_at, actual_pickup }) {
  const bigPrice = 200;
  const smallPrice = 150;

  const checkin = new Date(checkin_at);
  const checkout = new Date(checkout_at);
  const actual = actual_pickup ? new Date(actual_pickup) : new Date(); // 預設用現在時間

  const dailyPrice = bigCount * bigPrice + smallCount * smallPrice;

  const bookedDays = Math.ceil((checkout - checkin) / (1000 * 60 * 60 * 24));
  const paidAmount = dailyPrice * bookedDays;

  const actualDays = Math.ceil((actual - checkin) / (1000 * 60 * 60 * 24));

  let extraFee = 0;
  if (actualDays > bookedDays) {
    extraFee = (actualDays - bookedDays) * dailyPrice;
  }

  return { dailyPrice, bookedDays, actualDays, paidAmount, extraFee, total: paidAmount + extraFee };
}

// 盤點紀錄頁
app.get('/inventory/logs', requireLogin, (req, res) => {
  const search = `%${req.query.q || ''}%`;
  db.all(`
    SELECT i.scanned_at, l.code, o.order_no, s.real_name
    FROM inventory_scans i
    JOIN luggages l ON i.luggage_id = l.id
    JOIN orders o ON l.order_id = o.id
    JOIN staff s ON i.staff_id = s.id
    WHERE o.order_no LIKE ? OR l.code LIKE ? OR s.real_name LIKE ?
    ORDER BY i.scanned_at DESC
  `, [search, search, search], (err, logs) => {
    res.render('inventory_logs', { logs, query: req.query.q || '' });
  });
});

// 未盤點清單
app.get('/inventory/missing', requireLogin, (req, res) => {
  const search = `%${req.query.q || ''}%`;
  const todayStr = getTaiwanToday();

  db.all(`
    SELECT l.*, o.name AS customer_name, o.order_no, o.checkout_at
    FROM luggages l
    JOIN orders o ON l.order_id = o.id
    WHERE l.picked_at IS NULL
      AND (o.order_no LIKE ? OR o.name LIKE ? OR l.code LIKE ?)
      AND NOT EXISTS (
        SELECT 1
        FROM inventory_scans i
        WHERE i.luggage_id = l.id
          AND DATE(i.scanned_at) = ?
      )
    ORDER BY o.checkout_at ASC
  `, [search, search, search, todayStr], (err, missing) => {
    res.render('inventory_missing', { missing, query: req.query.q || '' });
  });
});

// 自動每日備份 (每天凌晨 2 點)
cron.schedule('0 2 * * *', () => {
  const date = getTaiwanToday().replace(/-/g, '');
  const src = path.join(__dirname, 'luggage.db');
  const dest = path.join(__dirname, 'exports', `backup_${date}.db`);
  fs.copyFile(src, dest, (err) => {
    if (err) console.error('❌ 自動備份失敗：', err);
    else console.log(`✅ 自動備份完成：backup_${date}.db`);
  });
});

// 部門列表
app.get('/departments', requireLogin, (req, res) => {
  if (!req.session.user.isAdmin) return res.send("沒有權限");
  db.all("SELECT * FROM departments ORDER BY id ASC", (err, departments) => {
    res.render('departments_list', { departments, error: null });
  });
});

// 新增部門頁面
app.get('/departments/new', requireLogin, (req, res) => {
  if (!req.session.user.isAdmin) return res.send("沒有權限");
  res.render('departments_new', { error: null });
});

// 提交新增部門
app.post('/departments/new', requireLogin, (req, res) => {
  if (!req.session.user.isAdmin) return res.send("沒有權限");
  const { name } = req.body;
  db.run("INSERT INTO departments (name) VALUES (?)", [name], (err) => {
    if (err) return res.render('departments_new', { error: '新增失敗，名稱可能已存在' });
    res.redirect('/departments');
  });
});

// 編輯部門頁面
app.get('/departments/:id/edit', requireLogin, (req, res) => {
  if (!req.session.user.isAdmin) return res.send("沒有權限");
  const id = req.params.id;
  db.get("SELECT * FROM departments WHERE id = ?", [id], (err, dept) => {
    if (!dept) return res.send("找不到該部門");
    res.render('departments_edit', { dept, error: null });
  });
});

// 提交編輯部門
app.post('/departments/:id/edit', requireLogin, (req, res) => {
  if (!req.session.user.isAdmin) return res.send("沒有權限");
  const { name } = req.body;
  const id = req.params.id;
  db.run("UPDATE departments SET name = ? WHERE id = ?", [name, id], (err) => {
    if (err) return res.render('departments_edit', { dept: { id, name }, error: '更新失敗' });
    res.redirect('/departments');
  });
});

// 刪除部門
app.post('/departments/:id/delete', requireLogin, (req, res) => {
  if (!req.session.user.isAdmin) return res.send("沒有權限");
  const id = req.params.id;
  db.run("DELETE FROM departments WHERE id = ?", [id], (err) => {
    if (err) return res.send("刪除失敗");
    res.redirect('/departments');
  });
});

// 列印單據 (每件行李一張)
app.get('/orders/:id/print', requireLogin, (req, res) => {
  const orderId = req.params.id;

  db.get(`
    SELECT o.*, d.name AS dept_name
    FROM orders o
    LEFT JOIN departments d ON o.department_id = d.id
    WHERE o.id = ?
  `, [orderId], (err, order) => {
    if (err) return res.send("資料庫查詢錯誤：" + err.message);
    if (!order) return res.send("找不到該訂單");

    db.all(`SELECT * FROM luggages WHERE order_id = ?`, [orderId], async (err2, luggages) => {
      if (err2) return res.send("無法讀取行李資料：" + err2.message);

      try {
        for (let luggage of luggages) {
          // 使用行李 code 生成 QR Code
          luggage.qrDataUrl = await QRCode.toDataURL(`http://localhost:3000/sign/${luggage.code}`);
        }
      } catch (qrErr) {
        console.error("QR Code 生成錯誤：", qrErr);
        return res.send("QR Code 生成失敗");
      }

      res.render('order_print', { order, luggages });
    });
  });
});

// 啟動伺服器
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});