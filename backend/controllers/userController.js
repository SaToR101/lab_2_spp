const pool = require('../db');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');
const { ALL_ROLES } = require('../utils/permissions');
const { parseId } = require('../utils/validators');

// GET /api/users
exports.list = async (req, res) => {
  const { rows } = await pool.query('SELECT id, email, role_id, created_at FROM users ORDER BY id');
  res.status(200).json(rows);
};

// PATCH /api/users/:id/role
exports.changeRole = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw AppError.badRequest('Некорректный id');

  const roleId = Number(req.body?.role_id);
  if (!ALL_ROLES.includes(roleId)) throw AppError.badRequest(`role_id должен быть одним из: ${ALL_ROLES.join(', ')}`);
  if (id === req.user.id) throw AppError.forbidden('Нельзя изменить собственную роль');

  const { rows: [user] } = await pool.query(
    'UPDATE users SET role_id = $1 WHERE id = $2 RETURNING id, email, role_id, created_at',
    [roleId, id]
  );
  if (!user) throw AppError.notFound('Пользователь не найден');

  logger.info('Роль пользователя изменена', { adminId: req.user.id, userId: id, roleId });
  res.status(200).json(user);
};
