// tools/add_admin.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./db/database.db');

const username = 'admin';
const password = '123456'; // 可改為你自己的密碼

db.run(
  `INSERT INTO admins (username, password) VALUES (?, ?)`,
  [username, password],
  function (err) {
    if (err) {
      console.error('新增失敗', err.message);
    } else {
      console.log('✅ 新增成功！帳號：admin，密碼：123456');
    }
    db.close();
  }
);
