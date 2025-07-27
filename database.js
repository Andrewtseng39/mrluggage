const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

// 建立 / 連線資料庫
const db = new sqlite3.Database(path.join(__dirname, 'luggage.db'), (err) => {
    if (err) {
        console.error("❌ 資料庫連線失敗：", err.message);
    } else {
        console.log("✅ 已成功連線 SQLite 資料庫 luggage.db");
    }
});

// 建立資料表
db.serialize(() => {
    // 部門表
    db.run(`CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    // 員工表
    db.run(`CREATE TABLE IF NOT EXISTS staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        real_name TEXT NOT NULL,
        department_id INTEGER,
        role TEXT CHECK(role IN ('Admin', 'Staff')) NOT NULL,
        active INTEGER DEFAULT 1,
        created_at TEXT,
        FOREIGN KEY(department_id) REFERENCES departments(id)
    )`);

    // 訂單表
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_no TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        big_count INTEGER,
        small_count INTEGER,
        checkin_at TEXT,
        checkout_at TEXT,
        total_days INTEGER,
        amount INTEGER,
        signed_at TEXT,
        signature_img TEXT,
        department_id INTEGER,
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY(department_id) REFERENCES departments(id)
    )`);

    // 行李表
    db.run(`CREATE TABLE IF NOT EXISTS luggages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER,
        code TEXT UNIQUE,
        size TEXT CHECK(size IN ('big', 'small')),
        picked_at TEXT,
        created_at TEXT,
        FOREIGN KEY(order_id) REFERENCES orders(id)
    )`);

    // 盤點紀錄表
    db.run(`CREATE TABLE IF NOT EXISTS inventory_scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        luggage_id INTEGER,
        staff_id INTEGER,
        scanned_at TEXT,
        FOREIGN KEY(luggage_id) REFERENCES luggages(id),
        FOREIGN KEY(staff_id) REFERENCES staff(id)
    )`);

    // 操作日誌表
    db.run(`CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER,
        action TEXT,
        target TEXT,
        created_at TEXT,
        FOREIGN KEY(staff_id) REFERENCES staff(id)
    )`);

    // 系統設定表
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);

    // 初始化設定（大件、小件價格）
    db.get(`SELECT COUNT(*) AS count FROM settings`, (err, row) => {
        if (!row || row.count === 0) {
            db.run(`INSERT INTO settings (key, value) VALUES 
                ('price_big', '200'),
                ('price_small', '150')`);
            console.log('✅ 已初始化大件/小件價格設定');
        }
    });

    // 初始化部門
    db.get(`SELECT COUNT(*) AS count FROM departments`, (err, row) => {
        if (!row || row.count === 0) {
            db.run(`INSERT INTO departments (name) VALUES ('台北部門')`);
            console.log('✅ 已建立預設部門：台北部門');
        }
    });

    // 初始化管理員帳號
    db.get(`SELECT COUNT(*) AS count FROM staff WHERE role='Admin'`, (err, row) => {
        if (!row || row.count === 0) {
            const hash = bcrypt.hashSync('admin123', 10);
            db.run(`INSERT INTO staff (username, password, real_name, department_id, role, created_at)
                VALUES ('admin', ?, '系統管理員', 1, 'Admin', datetime('now'))`, [hash]);
            console.log("✅ 已建立預設 Admin 帳號：帳號=admin，密碼=admin123");
        }
    });
});

// 匯出 db
module.exports = db;
