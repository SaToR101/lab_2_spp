const jwt = require('jsonwebtoken');
const pool = require('../db');
const config = require('../config');
const AppError = require('../utils/AppError');

// Проверка access-токена и того, что сессия (подключение) ещё активна.
// 401 — токена нет / он невалиден / истёк / сессия завершена. 403 — не хватает прав (см. checkRole).
exports.verifyToken = async (req, res, next) => {
  try {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) throw AppError.unauthorized('Токен доступа отсутствует');

    let payload;
    try {
      payload = jwt.verify(token, config.jwtAccessSecret);
    } catch (err) {
      throw AppError.unauthorized(err.name === 'TokenExpiredError' ? 'Срок действия токена истёк' : 'Невалидный токен');
    }

    // Роль берём из БД — изменение роли и завершение сессии действуют сразу, а не после истечения токена
    const { rows: [user] } = await pool.query(
      `SELECT u.id, u.email, u.role_id
         FROM refresh_tokens s JOIN users u ON u.id = s.user_id
        WHERE s.id = $1 AND s.user_id = $2 AND s.expires_at > NOW()`,
      [payload.sid, payload.id]
    );
    if (!user) throw AppError.unauthorized('Сессия завершена, выполните вход заново');

    req.user = { ...user, sid: payload.sid };
    next();
  } catch (err) {
    next(err);
  }
};

// Пропускает только перечисленные роли (см. ROLE в utils/permissions)
exports.checkRole = (allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role_id)) {
    return next(AppError.forbidden('У вас недостаточно прав для выполнения этой операции'));
  }
  next();
};
