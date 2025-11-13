// routes/admin.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ✅ 改用共用連線
const db = require('../db/connection');

// 顯示登入頁
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// 處理登入 (✅ 已修正：使用 bcrypt 驗證)
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    db.get(`SELECT * FROM admins WHERE username = ?`, [username], async (err, admin) => {
      if (err) {
        return res.render('login', { error: '登入錯誤，請稍後再試。' });
      }
      
      if (!admin || !(await bcrypt.compare(password, admin.password))) {
        return res.render('login', { error: '帳號或密碼錯誤' });
      }
      
      req.session.admin = admin;
      res.redirect('/admin');
    });
  } catch (error) {
    console.error('登入錯誤:', error);
    res.render('login', { error: '登入錯誤，請稍後再試。' });
  }
});

// 登出
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

// 後台首頁（可搜尋和篩選）
router.get('/', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const tzToday = new Date(Date.now() + 8*3600*1000).toISOString().slice(0,10);
  const from = (req.query.from || tzToday).trim();
  const to   = (req.query.to   || tzToday).trim();
  const archived = (req.query.archived === '1') ? 1 : 0;
  const keyword = (req.query.keyword || '').trim();
  const filter = req.query.filter || '';
  const locationId = req.query.location_id ? parseInt(req.query.location_id, 10) : null;

  const where = ['1=1'];
  const params = [];

  where.push('is_archived = ?'); params.push(archived);
  if (from) { where.push("substr(created_at,1,10) >= ?"); params.push(from); }
  if (to)   { where.push("substr(created_at,1,10) <= ?"); params.push(to); }
  if (filter === 'invoice') { where.push(`invoice_type = ?`); params.push('現場開立'); }
  else if (filter === 'digital') { where.push(`invoice_type = ?`); params.push('載具'); }
  if (locationId) { where.push('location_id = ?'); params.push(locationId); }
  if (keyword) {
    where.push(`(name LIKE ? OR phone LIKE ? OR order_id LIKE ? OR email LIKE ?)`);
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  const whereSql = where.join(' AND ');

  // 訂單列表
  const listSql = `
    SELECT *,
           (COALESCE(small_count,0) + COALESCE(large_count,0)) AS total_count 
    FROM orders 
    WHERE ${whereSql}
    ORDER BY created_at DESC
    LIMIT 1000
  `;

  db.all(listSql, params, (err, rows) => {
    if (err) return res.send('查詢失敗：' + err.message);

    let totalAmount = 0;
    let totalCount = 0;
    rows.forEach((order) => {
      totalAmount += order.total_price || 0;
      totalCount  += order.total_count || 0;
    });

    // 🔍 重複偵測（✅ 已修正電話號碼 +886 處理）
    const dupSql = `
      WITH base AS (
        -- 檢查姓名重複
        SELECT 'name' AS field, TRIM(name) AS value
        FROM orders WHERE ${whereSql}
        
        UNION ALL
        
        -- 檢查電話重複 (✅ 處理 +886 開頭)
        SELECT 'phone_norm' AS field,
               CASE 
                 WHEN phone LIKE '+886%' 
                 THEN '0' || SUBSTR(
                        REPLACE(REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'(',''),')',''), 
                        5
                      )
                 ELSE REPLACE(REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'(',''),')','')
               END AS value
        FROM orders WHERE ${whereSql}
        
        UNION ALL
        
        -- 檢查 Email 重複
        SELECT 'email' AS field, LOWER(TRIM(email)) AS value
        FROM orders WHERE ${whereSql}
      )
      SELECT
        CASE field WHEN 'phone_norm' THEN 'phone' ELSE field END AS field,
        value,
        COUNT(*) AS count
      FROM base
      WHERE value IS NOT NULL AND value != ''
      GROUP BY field, value
      HAVING COUNT(*) > 1
      ORDER BY count DESC, field ASC, value ASC
    `;

    // 因為在 CTE 裡用了三次 whereSql，要把 params 複製三份
    const dupParams = [...params, ...params, ...params];

    db.all(dupSql, dupParams, (eDup, duplicates) => {
      if (eDup) {
        console.error('重複檢查失敗：', eDup.message);
        // 即使檢查失敗也繼續顯示頁面，只是沒有重複資訊
        duplicates = [];
      }

      db.all(`SELECT id, name FROM locations WHERE is_active = 1 ORDER BY name ASC`, (e2, locs) => {
        if (e2) return res.send('讀取寄件地失敗：' + e2.message);

        res.render('admin', {
          orders: rows,
          totalAmount,
          totalCount,
          keyword,
          filter,
          from,
          to,
          archived: String(archived),
          locations: locs,
          selectedLocationId: locationId,
          duplicates // 👈 傳給 EJS 的查重結果
        });
      });
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
  const locationId = req.query.location_id ? parseInt(req.query.location_id, 10) : null;

  const where = ['1=1'];
  const params = [];

  where.push('is_archived = ?'); params.push(archived);
  if (from) { where.push("substr(created_at,1,10) >= ?"); params.push(from); }
  if (to)   { where.push("substr(created_at,1,10) <= ?"); params.push(to); }
  if (filter === 'invoice') { where.push(`invoice_type = ?`); params.push('現場開立'); }
  else if (filter === 'digital') { where.push(`invoice_type = ?`); params.push('載具'); }
  if (locationId) { where.push('location_id = ?'); params.push(locationId); }
  if (keyword) {
    where.push(`(name LIKE ? OR phone LIKE ? OR order_id LIKE ? OR email LIKE ?)`);
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  const sql = `
    SELECT order_id, name, phone, email,
           COALESCE(small_count,0) AS small_count,
           COALESCE(large_count,0) AS large_count,
           (COALESCE(small_count,0) + COALESCE(large_count,0)) AS total_count,
           total_price, invoice_type, carrier_number, created_at, is_archived, archived_at,
           location_name
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
      '電子郵件': row.email || '',
      '小件行李': row.small_count,
      '大件行李': row.large_count,
      '總件數': row.total_count,
      '總金額': row.total_price,
      '發票方式': row.invoice_type,
      '載具號碼': row.carrier_number || '無',
      '建立時間': row.created_at,
      '狀態': row.is_archived ? '已歸檔' : '未歸檔',
      '歸檔時間': row.archived_at || '',
      '寄件地': row.location_name || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(formattedRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, archived ? '歷史訂單' : '當前訂單');

    const filename = `orders_${from}_to_${to}${archived ? '_archived' : ''}.xlsx`;
    const tempDir = os.tmpdir();
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

// 提交編輯（✅ 已加入 email 寫回與驗證）
router.post('/edit/:order_id', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const orderId = req.params.order_id;
  const { name, phone, email, small_count, large_count, invoice_type, carrier_number } = req.body;

  // 基本驗證
  if (!name || !phone) return res.send('姓名與電話為必填');
  if (!email || !String(email).trim()) return res.send('Email 為必填');
  const emailSafe = String(email).trim();
  const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  if (!emailRe.test(emailSafe)) return res.send('Email 格式不正確');

  const small = parseInt(small_count, 10) || 0;
  const large = parseInt(large_count, 10) || 0;
  const total = small * 170 + large * 220;

  // 載具處理
  const toHalf = (s) => (s || '').toString().normalize('NFKC');
  const carrierNum = invoice_type === '載具'
    ? (toHalf(carrier_number).toUpperCase() || null)
    : null;

  if (invoice_type === '載具' && carrierNum) {
    const re = /^\/[0-9A-Z.\-+]{7}$/;
    if (!re.test(carrierNum)) {
      return res.status(400).send('載具號碼格式錯誤：需 / 開頭 + 7 碼（0-9 A-Z . - +）');
    }
  }

  db.run(
    `UPDATE orders
     SET name = ?, phone = ?, email = ?,
         small_count = ?, large_count = ?, total_price = ?,
         invoice_type = ?, carrier_number = ?
     WHERE order_id = ?`,
    [name, phone, emailSafe, small, large, total, invoice_type, carrierNum, orderId],
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

// 新增管理員 (✅ 已修正：密碼使用 bcrypt 加密)
router.post('/admins/add', async (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const { username, password } = req.body;
  if (!username || !password) return res.send('帳號與密碼不得為空');

  try {
    // 加密密碼
    const hashedPassword = await bcrypt.hash(password, 10);
    
    db.run(`INSERT INTO admins (username, password) VALUES (?, ?)`, [username, hashedPassword], function (err) {
      if (err) return res.send('新增失敗：' + err.message);
      res.redirect('/admin/admins');
    });
  } catch (error) {
    console.error('新增管理員錯誤:', error);
    res.send('新增失敗：' + error.message);
  }
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

// 顯示修改密碼頁面
router.get('/change-password/:id', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');
  
  const id = req.params.id;
  db.get(`SELECT id, username FROM admins WHERE id = ?`, [id], (err, admin) => {
    if (err || !admin) return res.send('找不到該管理員');
    res.render('change-password', { admin, error: null });
  });
});

// 處理修改密碼
router.post('/change-password/:id', async (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');
  
  const id = req.params.id;
  const { new_password, confirm_password } = req.body;
  
  // 驗證
  if (!new_password || !confirm_password) {
    db.get(`SELECT id, username FROM admins WHERE id = ?`, [id], (err, admin) => {
      return res.render('change-password', { 
        admin, 
        error: '新密碼與確認密碼不得為空' 
      });
    });
    return;
  }
  
  if (new_password !== confirm_password) {
    db.get(`SELECT id, username FROM admins WHERE id = ?`, [id], (err, admin) => {
      return res.render('change-password', { 
        admin, 
        error: '兩次輸入的密碼不一致' 
      });
    });
    return;
  }
  
  if (new_password.length < 6) {
    db.get(`SELECT id, username FROM admins WHERE id = ?`, [id], (err, admin) => {
      return res.render('change-password', { 
        admin, 
        error: '密碼長度至少需要 6 個字元' 
      });
    });
    return;
  }
  
  try {
    // 加密新密碼
    const hashedPassword = await bcrypt.hash(new_password, 10);
    
    db.run(
      `UPDATE admins SET password = ? WHERE id = ?`, 
      [hashedPassword, id], 
      function (err) {
        if (err) return res.send('更新失敗：' + err.message);
        res.redirect('/admin/admins?success=password_changed');
      }
    );
  } catch (error) {
    console.error('修改密碼錯誤:', error);
    db.get(`SELECT id, username FROM admins WHERE id = ?`, [id], (err, admin) => {
      return res.render('change-password', { 
        admin, 
        error: '修改失敗：' + error.message 
      });
    });
  }
});

// ================= 寄件地管理 ================= //

// 列表
router.get('/locations', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');
  db.all(`SELECT * FROM locations ORDER BY is_active DESC, name ASC`, (err, rows) => {
    if (err) return res.send('讀取寄件地失敗：' + err.message);
    res.render('locations', { locations: rows });
  });
});

// 新增
router.post('/locations/add', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');
  const { name, prefixes } = req.body;
  if (!name || !prefixes) return res.send('名稱與開頭字母不得為空');
  db.run(
    `INSERT INTO locations (name, prefixes, is_active) VALUES (?, ?, 1)`,
    [name.trim(), prefixes.trim()],
    function (err) {
      if (err) return res.send('新增失敗：' + err.message);
      res.redirect('/admin/locations');
    }
  );
});

// 啟用/停用
router.post('/locations/toggle/:id', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');
  const id = req.params.id;
  db.get(`SELECT is_active FROM locations WHERE id = ?`, [id], (err, row) => {
    if (err || !row) return res.send('找不到此寄件地');
    const next = row.is_active ? 0 : 1;
    db.run(`UPDATE locations SET is_active = ? WHERE id = ?`, [next, id], function (e2) {
      if (e2) return res.send('更新失敗：' + e2.message);
      res.redirect('/admin/locations');
    });
  });
});

// 刪除（若已有訂單綁定，僅允許停用）
router.post('/locations/delete/:id', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');
  const id = req.params.id;
  db.get(`SELECT COUNT(1) AS cnt FROM orders WHERE location_id = ?`, [id], (err, row) => {
    if (err) return res.send('檢查失敗：' + err.message);
    if (row && row.cnt > 0) return res.send('已有訂單使用此寄件地，請改為停用');
    db.run(`DELETE FROM locations WHERE id = ?`, [id], function (e2) {
      if (e2) return res.send('刪除失敗：' + e2.message);
      res.redirect('/admin/locations');
    });
  });
});

module.exports = router;