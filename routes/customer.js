// routes/customer.js
const express = require('express');
const router = express.Router();

// ✅ 改用共用連線
const db = require('../db/connection');

// 首頁
router.get('/', (req, res) => {
  res.render('index');
});

// 訂單編號：A~Z + 00~99
function generateOrderNo() {
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26));
  const number = ('0' + Math.floor(Math.random() * 100)).slice(-2);
  return letter + number;
}

// 避免撞號（若 DB 有 UNIQUE 這只是保險）
function generateUniqueOrderNo(cb) {
  const tryOnce = () => {
    const id = generateOrderNo();
    db.get('SELECT 1 FROM orders WHERE order_id = ?', [id], (err, row) => {
      if (err) return cb(err);
      if (row) return tryOnce();
      cb(null, id);
    });
  };
  tryOnce();
}

// 手機載具驗證（/ 開頭 + 7 碼英數，大寫）
function validateCarrierNumber(carrier) {
  if (!carrier) return true;
  return /^\/[A-Z0-9]{7}$/.test(carrier);
}

// 取得台灣時間字串 YYYY-MM-DD HH:mm:ss
function nowTaiwan() {
  return new Date(Date.now() + 8 * 3600 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
}

// 接收表單（PRG：寫入後 Redirect 到 GET /success/:orderId）
router.post('/submit', (req, res) => {
  const { name, phone, small_count, large_count, invoice, carrier, agree } = req.body;

  if (!agree) return res.send('請勾選同意條款才能提交');
  if (!name || !phone) return res.send('姓名和電話為必填欄位');

  const smallCount = parseInt(small_count) || 0;
  const largeCount = parseInt(large_count) || 0;
  if (smallCount === 0 && largeCount === 0) return res.send('請至少選擇一項商品');

  // 載具（統一轉大寫再驗證）
  const carrierNumber = invoice === '載具' ? ((carrier || '').toUpperCase() || null) : null;
  if (invoice === '載具' && carrierNumber && !validateCarrierNumber(carrierNumber)) {
    return res.send('載具號碼格式錯誤，請輸入正確的手機條碼格式（例：/ABC1234）');
  }

  const total = smallCount * 150 + largeCount * 200;
  const createdAt = nowTaiwan();

  generateUniqueOrderNo((genErr, orderNo) => {
    if (genErr) {
      console.error('產生訂單編號錯誤：', genErr);
      return res.send('系統發生錯誤，請稍後再試');
    }

    const sql = `
      INSERT INTO orders
      (order_id, name, phone, small_count, large_count, total_price, invoice_type, carrier_number, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    db.run(
      sql,
      [orderNo, name, phone, smallCount, largeCount, total, invoice, carrierNumber, createdAt],
      function (err) {
        if (err) {
          console.error('資料庫錯誤：', err);
          return res.send('系統發生錯誤，請稍後再試');
        }
        // ✅ 303：避免刷新重送 POST
        res.redirect(303, `/success/${orderNo}`);
      }
    );
  });
});

// 成功頁（GET：讀 DB 再 render）
router.get('/success/:orderId', (req, res) => {
  const orderId = req.params.orderId;
  db.get('SELECT * FROM orders WHERE order_id = ?', [orderId], (err, row) => {
    if (err) {
      console.error('查詢訂單錯誤：', err);
      return res.status(500).send('系統發生錯誤，請稍後再試');
    }
    if (!row) return res.status(404).send('找不到此訂單');

    res.render('success', {
      orderNo: row.order_id,
      name: row.name,
      phone: row.phone,
      small: row.small_count,
      large: row.large_count,
      total: row.total_price,
      invoice: row.invoice_type,
      carrierNumber: row.carrier_number || '無'
    });
  });
});

module.exports = router;
