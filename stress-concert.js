// stress-concert.js
// 演唱會行李寄存壓力測試：模擬很多人同時送出這個表單：/submit

import fetch from "node-fetch"; // 先跑：npm install node-fetch@2

// ===== ① 目標網址 =====
// 🔸線上（Render）測試用：
const TARGET = "https://mrluggage.onrender.com/submit";

// 🔹如果要先測本機，把上面註解掉，改用這一行：
// const TARGET = "http://localhost:10000/submit";

// ===== ② 測試參數（先保守一點） =====
const TOTAL_REQUESTS = 200; // 一共送出幾筆「假訂單」
const CONCURRENCY = 10;     // 一次同時幾個人送

// 建一筆表單資料（對應你的 <form> 欄位）
function buildFormData(index) {
  const formData = new URLSearchParams();

  // ⚠ 這裡全部都對應你表單的 name 屬性
  formData.append("name", `[壓測] 使用者${index}`); // name="name"
  formData.append("phone", "0912345678");           // name="phone"
  formData.append("email", `stress${index}@test.com`); // name="email"

  // 寄件地：name="location_id"
  // 這裡用 "1" 當測試值，如果你系統裡沒有 id=1，可以改成實際存在的 id
  formData.append("location_id", "1");

  // 行李數量：name="small_count" / "large_count"
  formData.append("small_count", "1"); // 束口袋 1 件
  formData.append("large_count", "0"); // 行李箱 0 件

  // 發票：name="invoice"
  // 你表單選項是「載具」或「現場開立」
  // 為了簡單，這裡用「現場開立」，就不用填載具號碼
  formData.append("invoice", "現場開立");

  // 載具欄位：name="carrier"（即使沒用到也補一個空字串）
  formData.append("carrier", "");

  // 服務條款勾選：name="agree"
  // checkbox 沒有 value 時，瀏覽器會送出 "on"
  formData.append("agree", "on");

  return formData;
}

// ===== ③ 送出一筆請求 =====
async function sendOne(index) {
  const formData = buildFormData(index);
  const start = Date.now();

  try {
    const res = await fetch(TARGET, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const ms = Date.now() - start;

    if (!res.ok) {
      console.error(`❌ [${index}] 狀態碼=${res.status} (${ms}ms)`);
    } else {
      console.log(`✅ [${index}] 成功 (${ms}ms)`);
    }
  } catch (err) {
    console.error(`💥 [${index}] 發生錯誤：${err.message}`);
  }
}

// ===== ④ 控制併發，一批一批送 =====
async function run() {
  console.log(
    `開始壓力測試：TARGET=${TARGET}, TOTAL=${TOTAL_REQUESTS}, CONCURRENCY=${CONCURRENCY}`
  );

  const allIndexes = Array.from({ length: TOTAL_REQUESTS }, (_, i) => i + 1);

  for (let i = 0; i < allIndexes.length; i += CONCURRENCY) {
    const batch = allIndexes.slice(i, i + CONCURRENCY);
    console.log(`🚀 發送第 ${batch[0]} ~ ${batch[batch.length - 1]} 筆`);

    await Promise.all(batch.map((idx) => sendOne(idx)));
  }

  console.log("✅ 壓力測試結束");
}

run().catch((err) => {
  console.error("壓力測試執行失敗：", err);
});
