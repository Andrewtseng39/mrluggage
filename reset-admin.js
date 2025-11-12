// reset-admin.js
import sqlite3 from "sqlite3";
import bcrypt from "bcrypt";
import path from "path";

const DB_DIR = process.env.DB_DIR || "/var/data";
const DB_FILE = process.env.DB_FILE || "concert.sqlite";
const DB_PATH = path.join(DB_DIR, DB_FILE);

const USERNAME = process.env.RESET_USER || "admin";
const NEW_PASS = process.env.RESET_PASS;

if (!NEW_PASS) {
  console.error("❌ 請用環境變數提供新密碼，例如：RESET_PASS='NewStrongPass!'");
  process.exit(1);
}

console.log(`🔐 正在重設帳號 [${USERNAME}] 密碼...`);
console.log(`📁 目標資料庫：${DB_PATH}`);

const db = new sqlite3.Database(DB_PATH, async (err) => {
  if (err) {
    console.error("❌ 無法開啟資料庫：", err.message);
    process.exit(1);
  }

  try {
    const hash = await bcrypt.hash(NEW_PASS, 12);
    db.run(
      "UPDATE admins SET password = ? WHERE username = ?",
      [hash, USERNAME],
      function (e) {
        if (e) {
          console.error("❌ 更新失敗：", e.message);
          process.exit(1);
        } else if (this.changes === 0) {
          console.error(`⚠️ 帳號 [${USERNAME}] 不存在！`);
          process.exit(1);
        } else {
          console.log(`✅ 已成功重設帳號 [${USERNAME}] 的密碼。`);
          process.exit(0);
        }
      }
    );
  } catch (e) {
    console.error("❌ 錯誤：", e.message);
    process.exit(1);
  }
});
