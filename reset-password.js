// reset-password.js
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'data', 'concert.sqlite');

console.log('正在重設密碼...');

const db = new sqlite3.Database(DB_PATH, async (err) => {
  if (err) {
    console.error('❌ 無法開啟資料庫:', err);
    return;
  }

  try {
    // 產生新的加密密碼
    const newPassword = '123456';
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    console.log('新密碼 (明文):', newPassword);
    console.log('加密後:', hashedPassword);
    
    // 更新資料庫
    db.run(
      `UPDATE admins SET password = ? WHERE username = 'admin'`,
      [hashedPassword],
      function(err) {
        if (err) {
          console.error('❌ 更新失敗:', err);
          db.close();
          return;
        }
        
        console.log('✅ 密碼已重設!');
        console.log('   影響的行數:', this.changes);
        console.log('');
        console.log('🎉 現在可以用以下帳號登入:');
        console.log('   帳號: admin');
        console.log('   密碼: 123456');
        
        // 驗證一次
        db.get(`SELECT * FROM admins WHERE username = 'admin'`, async (err2, admin) => {
          if (!err2 && admin) {
            const isMatch = await bcrypt.compare('123456', admin.password);
            console.log('');
            console.log('✅ 驗證結果:', isMatch ? '成功!' : '失敗 (不應該發生)');
          }
          db.close();
        });
      }
    );
  } catch (error) {
    console.error('❌ 錯誤:', error);
    db.close();
  }
});