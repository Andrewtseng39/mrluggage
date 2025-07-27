// utils/mailer.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',  // 這裡可以換成你用的郵件服務
  auth: {
    user: 'mr.luggage.tw@gmail.com', // 發送者信箱
    pass: '6747 6794'     // 不是 Gmail 登入密碼，而是應用程式密碼
  }
});

async function sendOrderEmail(to, orderInfo) {
  const mailOptions = {
    from: 'Mr. Luggage <mr.luggage.tw@gmail.com>',
    to,
    subject: `訂單確認 - ${orderInfo.order_no}`,
    html: `
      <h2>感謝您的預約！</h2>
      <p>以下是您的訂單資訊：</p>
      <ul>
        <li><b>訂單編號：</b> ${orderInfo.order_no}</li>
        <li><b>姓名：</b> ${orderInfo.name}</li>
        <li><b>電話：</b> ${orderInfo.phone}</li>
        <li><b>Email：</b> ${orderInfo.email}</li>
        <li><b>寄存日期：</b> ${orderInfo.checkin_at}</li>
        <li><b>取件日期：</b> ${orderInfo.checkout_at}</li>
        <li><b>行李件數：</b> ${orderInfo.luggage_count}</li>
        <li><b>金額：</b> NT$${orderInfo.amount}</li>
      </ul>
      <p>如有問題請聯絡我們，謝謝！</p>
    `
  };

  await transporter.sendMail(mailOptions);
}

module.exports = sendOrderEmail;
