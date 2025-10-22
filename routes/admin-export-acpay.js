// routes/admin-export-acpay.js
const ExcelJS = require('exceljs');
const dbConn = require('../db/connection'); // 依你的實際路徑

const OPEN_METHOD_CARRIER = 1; // ACPAY：發票開立方式（載具）
const TAX_CODE = 'T';
const EMAIL_FALLBACK = 'noemail@mrluggage.tw';
const PRICE = { small: 150, large: 200 };

// 取得 sqlite3 Database 物件（你的 connection 可能輸出 { db } 或直接是 db）
const sqlite = dbConn.db || dbConn;

// ---- 共用工具：確保每列 16 欄、數字欄位為數字 ----
function addRow16(ws, values, numberCols = []) {
  const row = [];
  for (let i = 0; i < 16; i++) {
    let v = values[i];
    if (v === undefined || v === null) v = '';
    if (numberCols.includes(i + 1)) {
      v = (v === '' ? '' : Number(v));
    }
    row.push(v);
  }
  ws.addRow(row);
}

// 封裝 db.all -> Promise
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    sqlite.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

// 檢查資料表是否有某欄位
async function hasColumn(table, column) {
  const rows = await all(`PRAGMA table_info(${table})`);
  return rows.some(r => r.name === column);
}

// 相容沒有 archived/location_id/created_at 的情況
async function getCarrierOrders({ from, to, keyword, location_id, archived }) {
  const hasArchived = await hasColumn('orders', 'archived');
  const hasLocation = await hasColumn('orders', 'location_id');
  const hasCreatedAt = await hasColumn('orders', 'created_at');

  let sql = `
    SELECT *
    FROM orders
    WHERE 1=1
      AND invoice_type = '載具'
  `;
  const args = [];

  if (hasArchived && (archived === '0' || archived === '1')) {
    sql += ` AND COALESCE(archived, 0) = ?`;
    args.push(Number(archived));
  }
  if (from && hasCreatedAt) {
    sql += ` AND date(created_at) >= date(?)`;
    args.push(from);
  }
  if (to && hasCreatedAt) {
    sql += ` AND date(created_at) <= date(?)`;
    args.push(to);
  }
  if (keyword && keyword.trim()) {
    sql += ` AND (order_id LIKE ? OR name LIKE ? OR phone LIKE ?)`;
    const k = `%${keyword.trim()}%`;
    args.push(k, k, k);
  }
  if (hasLocation && location_id) {
    sql += ` AND CAST(location_id AS TEXT) = ?`;
    args.push(String(location_id));
  }

  sql += hasCreatedAt
    ? ` ORDER BY datetime(created_at) DESC, order_id DESC`
    : ` ORDER BY order_id DESC`;

  return all(sql, args);
}

async function exportAcpay(req, res) {
  try {
    const { from, to, keyword = '', location_id, archived = '0' } = req.query || {};
    const orders = await getCarrierOrders({ from, to, keyword, location_id, archived });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('ACPAY-載具匯入');

    // 第1行：上層表頭（合併儲存格）
    addRow16(ws, [
      '消費者資訊', '', '', '', '', '', '', '', '', '', '',
      '商品明細', '', '', '', ''
    ]);
    ws.mergeCells('A1:K1'); // 消費者資訊
    ws.mergeCells('L1:P1'); // 商品明細
    ws.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).font = { bold: true };

    // 第2行：實際欄位表頭
    addRow16(ws, [
      '*項次', '(*)主次代號', '(*)發票開立方式', '(*)載具條碼/捐贈碼', '買受人名稱',
      '(*)統一編號', '*買受人電子信箱', '買受人地址', '自訂訂單編號', '交易序號',
      '備註', '*商品序', '*品項名稱', '*購買數量', '*單價', '*課稅別'
    ]);
    ws.getRow(2).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEA5514' } };
    ws.views = [{ state: 'frozen', ySplit: 2 }];
    [8,10,14,24,18,14,26,18,20,14,16,10,18,12,12,10]
      .forEach((w, i) => (ws.getColumn(i + 1).width = w));

    // 第3行開始：資料
    let invIndex = 1; // A 欄 *項次
    for (const o of orders) {
      const smallQty = Number(o.small_count || 0);
      const largeQty = Number(o.large_count || 0);

      const items = [];
      if (smallQty > 0) items.push({ name: '倉租(小)', qty: smallQty, price: PRICE.small });
      if (largeQty > 0) items.push({ name: '倉租(大)', qty: largeQty, price: PRICE.large });
      if (!items.length) continue;

      // 第一個品項（含主檔欄位）
      addRow16(ws, [
        invIndex,                    // A *項次（數字）
        'M',                         // B 主次代號
        OPEN_METHOD_CARRIER,         // C 開立方式（數字）
        (o.carrier_number || '').trim(),   // D 載具
        o.name || '',                // E 買受人
        '',                          // F 統編（載具匯出留空）
        (o.email || EMAIL_FALLBACK).trim(), // G 信箱
        '',                          // H 地址
        o.order_id || '',            // I 自訂訂單編號
        '',                          // J 交易序號
        '',                          // K 備註
        1,                           // L *商品序（數字）
        items[0].name,               // M *品項名稱
        items[0].qty,                // N *購買數量（數字）
        items[0].price,              // O *單價（數字）
        TAX_CODE                     // P *課稅別
      ], [1,3,12,14,15]); // A、C、L、N、O 欄設為數字

      // 後續品項（主檔欄位留空）
      for (let i = 1; i < items.length; i++) {
        addRow16(ws, [
          '', '', '', '', '', '', '', '', '', '', '',
          i + 1,                    // L *商品序（數字）
          items[i].name,            // M *品項名稱
          items[i].qty,             // N *購買數量（數字）
          items[i].price,           // O *單價（數字）
          TAX_CODE                  // P *課稅別
        ], [12,14,15]); // L、N、O 欄設為數字
      }

      invIndex++;
    }

    const filename = `acpay_carrier_${Date.now()}.xlsx`;
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(filename)}`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[exportAcpay] error:', err);
    res.status(500).send('ACPAY 匯出失敗');
  }
}

module.exports = { exportAcpay };
