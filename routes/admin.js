const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ✅ 改用共用連線
const db = require('../db/connection');

// ✅ 批次刪除專用密碼（你可以改成你想要的字串）
const BULK_DELETE_PASSWORD = 'MR70624227';

/**
 * 小工具：組回 /admin 的 query string，讓刪除、編輯完都能保留篩選條件
 */
function buildAdminQueryString({
  from = '',
  to = '',
  keyword = '',
  orderId = '',
  filter = '',
  archived = '',
  location_id = ''
} = {}) {
  const sp = new URLSearchParams({
    from: from || '',
    to: to || '',
    keyword: keyword || '',
    orderId: orderId || '',
    filter: filter || '',
    archived: archived || '',
    location_id: location_id || ''
  });
  return sp.toString();
}

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
  const orderId = (req.query.orderId || '').trim();       // ✅ 專門給訂單編號用
  const filter = req.query.filter || '';
  const locationId = req.query.location_id ? parseInt(req.query.location_id, 10) : null;

  const where = ['1=1'];
  const params = [];

  where.push('is_archived = ?'); params.push(archived);
  if (from) { where.push("substr(created_at,1,10) >= ?"); params.push(from); }
  if (to)   { where.push("substr(created_at,1,10) <= ?"); params.push(to); }

  if (filter === 'invoice') {
    where.push(`invoice_type = ?`);
    params.push('現場開立');
  } else if (filter === 'digital') {
    where.push(`invoice_type = ?`);
    params.push('載具');
  }

  if (locationId) {
    where.push('location_id = ?');
    params.push(locationId);
  }

  // 🔍 關鍵字只查姓名 / 電話 / Email
  if (keyword) {
    where.push(`(name LIKE ? OR phone LIKE ? OR email LIKE ?)`); 
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  // 🔍 專門搜尋訂單編號
  if (orderId) {
    where.push(`order_id LIKE ?`);
    params.push(`%${orderId}%`);
  }

  const whereSql = where.join(' AND ');

  // 訂單列表（✅ 未列印排最前面，其它照建立時間新到舊）
  const listSql = `
    SELECT *,
           (COALESCE(small_count,0) + COALESCE(large_count,0)) AS total_count 
    FROM orders 
    WHERE ${whereSql}
    ORDER BY
      CASE WHEN COALESCE(print_count, 0) = 0 THEN 0 ELSE 1 END ASC,
      created_at DESC
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
          orderId,                    // ✅ 傳給 EJS，對應你新增的欄位
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
  const orderId = (req.query.orderId || '').trim();       // ✅ 匯出也支援訂單編號
  const filter = req.query.filter || '';
  const locationId = req.query.location_id ? parseInt(req.query.location_id, 10) : null;

  const where = ['1=1'];
  const params = [];

  where.push('is_archived = ?'); params.push(archived);
  if (from) { where.push("substr(created_at,1,10) >= ?"); params.push(from); }
  if (to)   { where.push("substr(created_at,1,10) <= ?"); params.push(to); }

  if (filter === 'invoice') {
    where.push(`invoice_type = ?`);
    params.push('現場開立');
  } else if (filter === 'digital') {
    where.push(`invoice_type = ?`);
    params.push('載具');
  }

  if (locationId) {
    where.push('location_id = ?');
    params.push(locationId);
  }

  // 🔍 關鍵字只查姓名 / 電話 / Email
  if (keyword) {
    where.push(`(name LIKE ? OR phone LIKE ? OR email LIKE ?)`); 
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  // 🔍 匯出時也可以只針對訂單編號
  if (orderId) {
    where.push(`order_id LIKE ?`);
    params.push(`%${orderId}%`);
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

    res.download(filepath, filename, (err2) => {
      if (!err2) fs.unlinkSync(filepath);
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

// 顯示編輯頁（✅ 帶入目前的篩選條件）
router.get('/edit/:order_id', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const orderId = req.params.order_id;

  // 從 query 把目前的篩選條件帶進來，等等丟給 EJS
  const {
    from = '',
    to = '',
    keyword = '',
    orderId: orderIdSearch = '',
    filter = '',
    archived = '',
    location_id = ''
  } = req.query;

  db.get(`SELECT * FROM orders WHERE order_id = ?`, [orderId], (err, order) => {
    if (err || !order) return res.send('找不到該筆訂單');
    res.render('edit', { 
      order,
      from,
      to,
      keyword,
      orderIdSearch,
      filter,
      archived,
      location_id
    });
  });
});

// 提交編輯（✅ 編輯後保留原本的篩選條件）
router.post('/edit/:order_id', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const orderId = req.params.order_id;
  const { 
    name, 
    phone, 
    email, 
    small_count, 
    large_count, 
    invoice_type, 
    carrier_number,

    // 這幾個是從表單 hidden 帶回來的篩選條件
    from = '',
    to = '',
    keyword = '',
    orderIdSearch = '',
    filter = '',
    archived = '',
    location_id = ''
  } = req.body;

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
    (err) => {
      if (err) return res.send('更新失敗：' + err.message);

      // ✅ 編輯完一樣回到原本篩選條件
      const qs = buildAdminQueryString({
        from,
        to,
        keyword,
        orderId: orderIdSearch,
        filter,
        archived,
        location_id
      });
      res.redirect('/admin?' + qs);
    }
  );
});

// ✅ 單筆刪除（保留原本邏輯，不限日期）
router.post('/delete/:order_id', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const orderId = req.params.order_id;

  // 從表單拿回目前的篩選條件
  const {
    from = '',
    to = '',
    keyword = '',
    orderIdSearch = '',
    filter = '',
    archived = '',
    location_id = ''
  } = req.body;

  db.run(`DELETE FROM orders WHERE order_id = ?`, [orderId], (err) => {
    if (err) return res.send('刪除失敗：' + err.message);

    const qs = buildAdminQueryString({
      from,
      to,
      keyword,
      orderId: orderIdSearch,
      filter,
      archived,
      location_id
    });
    res.redirect('/admin?' + qs);
  });
});

// ✅ 批次刪除目前篩選的訂單（需密碼，且只能刪除三天前含以前）
router.post('/delete-range', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const {
    from = '',
    to = '',
    keyword = '',
    orderIdSearch = '',
    filter = '',
    archived = '',
    location_id = '',
    delete_password = ''
  } = req.body;

  // 1️⃣ 密碼驗證
  if (!delete_password || delete_password !== BULK_DELETE_PASSWORD) {
    return res.send('批次刪除密碼錯誤，未執行刪除。');
  }

  // 2️⃣ 日期區間檢查
  if (!from || !to) {
    return res.send('請先設定要刪除的日期區間（from / to）。');
  }

  // 取得「台灣時間的今天」，再往前推 3 天
  const now = new Date(Date.now() + 8*3600*1000);
  now.setHours(0, 0, 0, 0);
  const threeDaysAgoDate = new Date(now.getTime() - 3 * 24 * 3600 * 1000);
  const limitDate = threeDaysAgoDate.toISOString().slice(0, 10); // YYYY-MM-DD

  // 只允許刪「limitDate（含）以前」的訂單
  if (to > limitDate) {
    return res.send(`僅允許刪除「${limitDate}（含）」之前的訂單，請調整日期區間後再試。`);
  }

  // 3️⃣ 組 where 條件（沿用列表邏輯，外加日期限制）
  const where = ['1=1'];
  const params = [];

  // archived
  const archivedFlag = archived === '1' ? 1 : 0;
  where.push('is_archived = ?');
  params.push(archivedFlag);

  // 日期
  if (from) {
    where.push("substr(created_at,1,10) >= ?");
    params.push(from);
  }
  if (to) {
    where.push("substr(created_at,1,10) <= ?");
    params.push(to);
  }

  // filter：發票類型
  if (filter === 'invoice') {
    where.push(`invoice_type = ?`);
    params.push('現場開立');
  } else if (filter === 'digital') {
    where.push(`invoice_type = ?`);
    params.push('載具');
  }

  // 寄件地
  if (location_id) {
    where.push('location_id = ?');
    params.push(parseInt(location_id, 10));
  }

  // 關鍵字：姓名 / 電話 / Email
  if (keyword) {
    where.push(`(name LIKE ? OR phone LIKE ? OR email LIKE ?)`); 
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  // 訂單編號
  if (orderIdSearch) {
    where.push(`order_id LIKE ?`);
    params.push(`%${orderIdSearch}%`);
  }

  const deleteSql = `
    DELETE FROM orders
    WHERE ${where.join(' AND ')}
  `;

  db.run(deleteSql, params, function(err) {
    if (err) return res.send('批次刪除失敗：' + err.message);

    console.log(`批次刪除完成，共刪除 ${this.changes || 0} 筆訂單。`);

    const qs = buildAdminQueryString({
      from,
      to,
      keyword,
      orderId: orderIdSearch,
      filter,
      archived,
      location_id
    });
    res.redirect('/admin?' + qs);
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
    
    db.run(`INSERT INTO admins (username, password) VALUES (?, ?)`, [username, hashedPassword], (err) => {
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
  db.run(`DELETE FROM admins WHERE id = ?`, (err) => {
    if (err) return res.send('刪除失敗：' + err.message);
    res.redirect('/admin/admins');
  });
});

// 顯示修改密碼頁面
router.get('/change-password/:id', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');
  
  const id = req.params.id;
  db.get(`SELECT id, username FROM admins WHERE id = ?`, (err, admin) => {
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
    db.get(`SELECT id, username FROM admins WHERE id = ?`, (err, admin) => {
      return res.render('change-password', { 
        admin, 
        error: '新密碼與確認密碼不得為空' 
      });
    });
    return;
  }
  
  if (new_password !== confirm_password) {
    db.get(`SELECT id, username FROM admins WHERE id = ?`, (err, admin) => {
      return res.render('change-password', { 
        admin, 
        error: '兩次輸入的密碼不一致' 
      });
    });
    return;
  }
  
  if (new_password.length < 6) {
    db.get(`SELECT id, username FROM admins WHERE id = ?`, (err, admin) => {
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
      (err) => {
        if (err) return res.send('更新失敗：' + err.message);
        res.redirect('/admin/admins?success=password_changed');
      }
    );
  } catch (error) {
    console.error('修改密碼錯誤:', error);
    db.get(`SELECT id, username FROM admins WHERE id = ?`, (err, admin) => {
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
    (err) => {
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

    db.run(
      `UPDATE locations SET is_active = ? WHERE id = ?`,
      [next, id],
      (e2) => {
        if (e2) return res.send('更新失敗：' + e2.message);
        res.redirect('/admin/locations');
      }
    );
  });
});


// 刪除（若已有訂單綁定，僅允許停用）
router.post('/locations/delete/:id', (req, res) => {
  if (!req.session.admin) return res.redirect('/admin/login');

  const id = req.params.id;

  db.get(
    `SELECT COUNT(1) AS cnt FROM orders WHERE location_id = ?`,
    [id],
    (err, row) => {
      if (err) return res.send('檢查失敗：' + err.message);

      if (row && row.cnt > 0) {
        return res.send('已有訂單使用此寄件地，請改為停用');
      }

      db.run(
        `DELETE FROM locations WHERE id = ?`,
        [id],     
        (e2) => {
          if (e2) return res.send('刪除失敗：' + e2.message);
          res.redirect('/admin/locations');
        }
      );
    }
  );
});
module.exports = router;
