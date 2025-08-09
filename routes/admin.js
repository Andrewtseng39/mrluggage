// routes/admin.js
const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

// ✅ 改用共用連線
const db = require('../db/connection');

// 顯示登入頁
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// 處理登入
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM admins WHERE username = ? AND password = ?`, [username, password], (err, admin) => {
    if (err) {
      return res.render('login', { error: '登入錯誤，請稍後再試。' });
    }
    if (admin) {
      req.session.admin = admin;
      res.redirect('/admin');
    } else {
      res.render('login', { error: '帳號或密碼錯誤' });
    }
  });
});

// 後台首頁（可搜尋和篩選）
router.get('/', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  // 預設今天（台灣時間）
  const tzToday = new Date(Date.now() + 8*3600*1000).toISOString().slice(0,10);
  const from = (req.query.from || tzToday).trim();
  const to   = (req.query.to   || tzToday).trim();
  const archived = (req.query.archived === '1') ? 1 : 0; // 0 未歸檔、1 已歸檔
  const keyword = (req.query.keyword || '').trim();
  const filter = req.query.filter || ''; // 'invoice' | 'digital' | ''

  const where = ['1=1'];
  const params = [];

  // 歸檔狀態（若你暫時沒用歸檔，也可固定 0）
  where.push('is_archived = ?');
  params.push(archived);

  // 日期區間（created_at 格式 "YYYY-MM-DD HH:mm:ss"）
  if (from) { where.push("substr(created_at,1,10) >= ?"); params.push(from); }
  if (to)   { where.push("substr(created_at,1,10) <= ?"); params.push(to); }

  // 發票篩選
  if (filter === 'invoice') { where.push(`invoice_type = ?`); params.push('現場開立'); }
  else if (filter === 'digital') { where.push(`invoice_type = ?`); params.push('載具'); }

  // 關鍵字（加訂單編號）
  if (keyword) {
    where.push(`(name LIKE ? OR phone LIKE ? OR order_id LIKE ?)`);
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  const sql = `
    SELECT *,
           (COALESCE(small_count,0) + COALESCE(large_count,0)) AS total_count 
    FROM orders 
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT 1000
  `;

  db.all(sql, params, (err, rows) => {
    if (err) return res.send('查詢失敗：' + err.message);

    let totalAmount = 0;
    let totalCount = 0;
    rows.forEach((order) => {
      totalAmount += order.total_price || 0;
      totalCount  += order.total_count || 0;
    });

    res.render('admin', {
      orders: rows,
      totalAmount,
      totalCount,
      keyword,
      filter,
      from,
      to,
      archived: String(archived)
    });
  });
});

// 匯出 Excel（與列表同條件）
router.get('/export', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const tzToday = new Date(Date.now() + 8*3600*1000).toISOString().slice(0,10);
  const from = (req.query.from || tzToday).trim();
  const to   = (req.query.to   || tzToday).trim();
  const archived = (req.query.archived === '1') ? 1 : 0;
  const keyword = (req.query.keyword || '').trim();
  const filter = req.query.filter || '';

  const where = ['1=1'];
  const params = [];

  where.push('is_archived = ?'); params.push(archived);
  if (from) { where.push("substr(created_at,1,10) >= ?"); params.push(from); }
  if (to)   { where.push("substr(created_at,1,10) <= ?"); params.push(to); }
  if (filter === 'invoice') { where.push(`invoice_type = ?`); params.push('現場開立'); }
  else if (filter === 'digital') { where.push(`invoice_type = ?`); params.push('載具'); }
  if (keyword) { where.push(`(name LIKE ? OR phone LIKE ? OR order_id LIKE ?)`); params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`); }

  const sql = `
    SELECT order_id, name, phone,
           COALESCE(small_count,0) AS small_count,
           COALESCE(large_count,0) AS large_count,
           (COALESCE(small_count,0) + COALESCE(large_count,0)) AS total_count,
           total_price, invoice_type, carrier_number, created_at, is_archived, archived_at
    FROM orders
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC
  `;

  db.all(sql, params, (err, rows) => {
    if (err) return res.send('資料匯出失敗：' + err.message);

    const formattedRows = rows.map(row => ({
      '訂單編號': row.order_id,
      '姓名': row.name,
      '電話': row.phone,
      '小件行李': row.small_count,
      '大件行李': row.large_count,
      '總件數': row.total_count,
      '總金額': row.total_price,
      '發票方式': row.invoice_type,
      '載具號碼': row.carrier_number || '無',
      '建立時間': row.created_at,
      '狀態': row.is_archived ? '已歸檔' : '未歸檔',
      '歸檔時間': row.archived_at || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, archived ? '歷史訂單' : '當前訂單');

    const filename = `orders_${from}_to_${to}${archived ? '_archived' : ''}.xlsx`;
    // ✅ 雲端友善：寫到暫存目錄
    const tempDir = process.env.TMPDIR || '/tmp';
    const filepath = path.join(tempDir, filename);
    XLSX.writeFile(workbook, filepath);

    res.download(filepath, filename, (err) => {
      if (!err) fs.unlinkSync(filepath);
    });
  });
});

// 列印寄存單
router.get('/print/:order_id', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const orderId = req.params.order_id;
  db.get(`SELECT * FROM orders WHERE order_id = ?`, [orderId], (err, order) => {
    if (err || !order) return res.send('找不到訂單');

    const count = (order.small_count || 0) + (order.large_count || 0);
    res.render('print', { order, count });
  });
});

// 顯示編輯頁
router.get('/edit/:order_id', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const orderId = req.params.order_id;
  db.get(`SELECT * FROM orders WHERE order_id = ?`, [orderId], (err, order) => {
    if (err || !order) return res.send('找不到該筆訂單');
    res.render('edit', { order });
  });
});

// 提交編輯
router.post('/edit/:order_id', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const orderId = req.params.order_id;
  const { name, phone, small_count, large_count, invoice_type, carrier_number } = req.body;

  const small = parseInt(small_count) || 0;
  const large = parseInt(large_count) || 0;
  const total = small * 150 + large * 200;

  // 若不是載具，清空載具號碼；若是載具，轉大寫
  const carrierNum = invoice_type === '載具'
    ? ((carrier_number || '').toUpperCase() || null)
    : null;

  db.run(
    `UPDATE orders
     SET name = ?, phone = ?, small_count = ?, large_count = ?, total_price = ?, invoice_type = ?, carrier_number = ?
     WHERE order_id = ?`,
    [name, phone, small, large, total, invoice_type, carrierNum, orderId],
    function (err) {
      if (err) return res.send('更新失敗：' + err.message);
      res.redirect('/admin');
    }
  );
});

// 刪除訂單
router.post('/delete/:order_id', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const orderId = req.params.order_id;
  db.run(`DELETE FROM orders WHERE order_id = ?`, [orderId], function (err) {
    if (err) return res.send('刪除失敗：' + err.message);
    res.redirect('/admin');
  });
});

// 管理員管理頁面
router.get('/admins', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  db.all(`SELECT * FROM admins`, (err, admins) => {
    if (err) return res.send('讀取管理員失敗：' + err.message);
    res.render('admins', { admins });
  });
});

// 新增管理員
router.post('/admins/add', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const { username, password } = req.body;
  if (!username || !password) return res.send('帳號與密碼不得為空');

  db.run(`INSERT INTO admins (username, password) VALUES (?, ?)`, [username, password], function (err) {
    if (err) return res.send('新增失敗：' + err.message);
    res.redirect('/admin/admins');
  });
});

// 刪除管理員
router.post('/admins/delete/:id', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const id = req.params.id;
  db.run(`DELETE FROM admins WHERE id = ?`, [id], function (err) {
    if (err) return res.send('刪除失敗：' + err.message);
    res.redirect('/admin/admins');
  });
});

module.exports = router;
