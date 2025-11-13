// check-db.js
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

// ✅ 使用正確的路徑
const DB_PATH = path.join(process.cwd(), 'data', 'concert.sqlite');

console.log('檢查資料庫:', DB_PATH);

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ 無法開啟資料庫:', err);
    return;
  }

  db.get(`SELECT * FROM admins WHERE username = 'admin'`, async (err, admin) => {
    if (err) {
      console.error('❌ 查詢錯誤:', err.message);
      db.close();
      return;
    }
    
    if (!admin) {
      console.log('❌ 找不到 admin 帳號');
      console.log('');
      console.log('🔧 需要執行初始化!請確認:');
      console.log('   1. 伺服器有正常啟動過嗎?');
      console.log('   2. 啟動時有看到 "✅ 資料庫初始化完成" 嗎?');
      db.close();
      return;
    }
    
    console.log('✅ 找到管理員帳號:');
    console.log('   帳號:', admin.username);
    console.log('   密碼 (加密):', admin.password);
    console.log('   密碼長度:', admin.password.length);
    console.log('');
    
    // 測試密碼驗證
    bcrypt.compare('123456', admin.password).then(isMatch => {
      console.log('   🔑 用 123456 驗證:', isMatch ? '✅ 成功' : '❌ 失敗');
      
      if (!isMatch) {
        console.log('');
        console.log('💡 密碼不符!可能原因:');
        console.log('   1. 資料庫裡的密碼不是用 bcrypt 加密的');
        console.log('   2. 初始化時出錯了');
      }
      
      db.close();
    });
  });
});
