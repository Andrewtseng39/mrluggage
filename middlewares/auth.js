// middlewares/auth.js
function ensureLogin(req, res, next) {
  // 依你專案的 session/登入狀態調整：
  // 假設有 req.session.admin 代表已登入
  if (req.session && req.session.admin) return next();

  // 未登入：導回登入頁或回 401
  if (req.path.startsWith('/admin')) {
    return res.redirect('/admin/login'); // 若有登入頁
    // 或：return res.status(401).send('Unauthorized');
  }
  return next();
}

module.exports = { ensureLogin };
