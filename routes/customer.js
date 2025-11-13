// routes/customer.js
const express = require('express');
const router = express.Router();

// ✅ 共用連線
const db = require('../db/connection');

// ==== Helpers ====

// 手機載具驗證（/ 開頭 + 7 碼；允許 0-9 A-Z . - +；全形轉半形、轉大寫）
function validateCarrierNumber(carrier) {
  if (!carrier) return true; // 留空視為不驗
  const s = String(carrier).normalize('NFKC').trim().toUpperCase();
  return /^\/[0-9A-Z.\-+]{7}$/.test(s);
}

// 取得台灣時間字串 YYYY-MM-DD HH:mm:ss
function nowTaiwan() {
  return new Date(Date.now() + 8 * 3600 * 1000)
    .toISOString()
    .replace('T', ' ')
    .slice(0, 19);
}

// ==== 訂單編號產生：字母 + 3 位數，並平均分配字母 ====

// 依寄件地 prefixes 產生流水號（字母 + 3位數，平均分配）
const crypto = require('crypto');

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 3 位數 000–999
function rand3() {
  return String(crypto.randomInt(0, 1000)).padStart(3, '0');
}

/**
 * 從 DB 中查目前各字母使用次數，挑「用最少的那幾個」再隨機選一個
 * letters: ['A','B','C', ...]
 * cb(err, letter)
 */
function pickBalancedLetter(letters, cb) {
  const placeholders = letters.map(() => '?').join(',');
  const sql = `
    SELECT substr(order_id, 1, 1) AS prefix, COUNT(*) AS cnt
    FROM orders
    WHERE substr(order_id, 1, 1) IN (${placeholders})
    GROUP BY prefix
  `;

  db.all(sql, letters, (err, rows) => {
    if (err) return cb(err);

    // 先把所有字母預設為 0
    const counts = new Map();
    letters.forEach((l) => counts.set(l, 0));

    // 把 DB 查出來的覆蓋進去
    rows.forEach((r) => {
      counts.set(r.prefix, r.cnt);
    });

    // 找出目前最少的使用次數
    let min = Infinity;
    letters.forEach((l) => {
      const c = counts.get(l);
      if (c < min) min = c;
    });

    // 把所有「次數 = 最少」的字母挑出來
    const candidates = letters.filter((l) => counts.get(l) === min);

    // 在最少的那幾個裡面隨機選一個
    const chosen = pickRandom(candidates);
    cb(null, chosen);
  });
}

/**
 * 產生字母 + 3 位數的訂單編號，並確保不重複
 * prefixesStr 例如: "A,B,C,D,E,F"
 * cb(err, orderId)
 */
function genUniqueOrderIdWithPrefixes(prefixesStr, cb, tries = 0) {
  const letters = String(prefixesStr || '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  if (!letters.length) {
    return cb(new Error('此寄件地尚未設定字母開頭'));
  }

  // 先挑「目前用得最少」的字母
  pickBalancedLetter(letters, (err, letter) => {
    if (err) return cb(err);

    const candidate = letter + rand3(); // 例如 A157

    db.get(
      `SELECT 1 FROM orders WHERE order_id = ?`,
      [candidate],
      (err2, row) => {
        if (err2) return cb(err2);
        if (!row) return cb(null, candidate); // 沒撞號 → OK

        // 撞號就重試，多給一點空間（3 位其實很安全）
        if (tries > 50) {
          return cb(new Error('訂單編號產生失敗（碰撞過多）'));
        }

        genUniqueOrderIdWithPrefixes(prefixesStr, cb, tries + 1);
      }
    );
  });
}

// ==== Routes ====

// 首頁：渲染寄件地下拉
router.get('/', (req, res) => {
  db.all(
    `SELECT id, name FROM locations WHERE is_active = 1 ORDER BY name ASC`,
    (err, locs) => {
      if (err) return res.status(500).send('讀取寄件地失敗：' + err.message);
      res.render('index', { locations: locs || [] });
    }
  );
});

// 接收表單（PRG：寫入後 Redirect 到 GET /success/:orderId）
router.post('/submit', (req, res) => {
  const {
    name,
    phone,
    email,
    small_count,
    large_count,
    invoice,
    carrier,
    agree,
    location_id,
  } = req.body;

  // 基本驗證
  if (!agree) return res.status(400).send('請勾選同意條款才能提交');
  if (!name || !phone) return res.status(400).send('姓名和電話為必填欄位');

  // ✅ Email 必填 + 格式
  const emailSafe = String(email || '').trim();
  if (!emailSafe) return res.status(400).send('Email 為必填欄位');
  const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  if (!emailRe.test(emailSafe))
    return res.status(400).send('Email 格式不正確');

  const smallCount = parseInt(small_count, 10) || 0;
  const largeCount = parseInt(large_count, 10) || 0;
  if (smallCount === 0 && largeCount === 0)
    return res.status(400).send('請至少選擇一項商品');

  // 寄件地必填
  const locId = parseInt(location_id, 10);
  if (!locId) return res.status(400).send('請選擇寄件地');

  // 發票方式必填
  if (!invoice) return res.status(400).send('請選擇發票方式');

  // 載具處理
  const raw =
    typeof carrier === 'string' ? carrier.normalize('NFKC').trim() : '';
  const carrierNumber = invoice === '載具' && raw ? raw.toUpperCase() : null;
  if (invoice === '載具' && carrierNumber && !validateCarrierNumber(carrierNumber)) {
    return res
      .status(400)
      .send(
        '載具號碼格式錯誤，請輸入正確的手機條碼（例：/ABC12.+ 或 /A1B-2C3）。'
      );
  }

  const total = smallCount * 170 + largeCount * 220;
  const createdAt = nowTaiwan();

  // 1) 讀寄件地設定
  db.get(
    `SELECT id, name, prefixes FROM locations WHERE id = ? AND is_active = 1`,
    [locId],
    (err, loc) => {
      if (err) return res.status(500).send('讀取寄件地失敗：' + err.message);
      if (!loc) return res.status(400).send('寄件地無效或未啟用');

      // 2) 產出不重複 order_id（字母 + 3 位數，且平均分配字母）
      genUniqueOrderIdWithPrefixes(loc.prefixes, (genErr, orderNo) => {
        if (genErr) {
          console.error('產生訂單編號錯誤：', genErr);
          return res.status(500).send('系統發生錯誤，請稍後再試');
        }

        // 3) 寫入（包含 email / location）
        const sql = `
          INSERT INTO orders
            (order_id, name, phone, email, small_count, large_count, total_price,
             invoice_type, carrier_number, created_at,
             location_id, location_name, is_archived)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)
        `;
        db.run(
          sql,
          [
            orderNo,
            name,
            phone,
            emailSafe,
            smallCount,
            largeCount,
            total,
            invoice,
            carrierNumber,
            createdAt,
            loc.id,
            loc.name,
          ],
          function (e2) {
            if (e2) {
              console.error('資料庫錯誤：', e2);
              return res.status(500).send('系統發生錯誤，請稍後再試');
            }
            // ✅ 303 防重送
            res.redirect(303, `/success/${orderNo}`);
          }
        );
      });
    }
  );
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
      email: row.email || '',
      small: row.small_count,
      large: row.large_count,
      total: row.total_price,
      invoice: row.invoice_type,
      carrierNumber: row.carrier_number || '無',
      locationName: row.location_name || '-', // 成功頁顯示寄件地
    });
  });
});

module.exports = router;
