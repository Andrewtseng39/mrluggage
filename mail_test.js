const nodemailer = require('nodemailer');

// 建立寄信 transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'mr.luggage.tw@gmail.com',  // ★改成你的 Gmail
    pass: 'lmnw diri xeop ntpa'            // ★改成 Google App Password
  }
});

// 設定測試信件
const mailOptions = {
  from: '你的Gmail帳號@gmail.com',
  to: 'andrewtseng39@gmail.com',          // ★改成你想測試的收件地址
  subject: '【測試】Mr. Luggage 寄信功能',
  html: `
    <h2>這是一封測試信</h2>
    <p>如果你收到這封信，代表 <strong>nodemailer 設定成功</strong>！</p>
  `
};

// 發送測試信件
transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    console.error('❌ 寄信失敗：', error);
  } else {
    console.log('✅ 測試信件已寄出：', info.response);
  }
});
