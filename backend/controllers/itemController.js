const pool = require('../db');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');
const { canModifyItem } = require('../utils/permissions');
const { validateItem, parseId } = require('../utils/validators');
const { removeUpload, uploadedPath } = require('../middleware/upload');

const SELECT_WITH_OWNER = `
  SELECT i.*, u.email AS owner_email
    FROM items i LEFT JOIN users u ON u.id = i.owner_id`;

// Находит запись, которую текущий пользователь вправе изменять/удалять, иначе 400/404/403
const findOwnItem = async (req, action) => {
  const id = parseId(req.params.id);
  if (!id) throw AppError.badRequest('Некорректный id');

  const { rows: [item] } = await pool.query('SELECT * FROM items WHERE id = $1', [id]);
  if (!item) throw AppError.notFound('Запись не найдена');

  if (!canModifyItem(req.user, item)) {
    logger.warn('Попытка изменить чужую запись', { userId: req.user.id, itemId: id, action });
    throw AppError.forbidden(`Вы можете ${action} только свои записи`);
  }
  return item;
};

const validated = (body) => {
  const errors = validateItem(body || {});
  if (errors.length) throw AppError.badRequest('Ошибка валидации', errors);
  return { title: body.title.trim(), description: body.description.trim() };
};

// GET /api/items
exports.list = async (req, res) => {
  const { rows } = await pool.query(`${SELECT_WITH_OWNER} ORDER BY i.id DESC`);
  res.status(200).json(rows);
};

// GET /api/items/:id
exports.get = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw AppError.badRequest('Некорректный id');

  const { rows: [item] } = await pool.query(`${SELECT_WITH_OWNER} WHERE i.id = $1`, [id]);
  if (!item) throw AppError.notFound('Запись не найдена');
  res.status(200).json(item);
};

// POST /api/items — автором становится текущий пользователь
exports.create = async (req, res) => {
  const { title, description } = validated(req.body);
  const { rows: [item] } = await pool.query(
    'INSERT INTO items (title, description, file_path, owner_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [title, description, uploadedPath(req.file), req.user.id]
  );
  logger.info('Запись создана', { userId: req.user.id, itemId: item.id });
  res.status(201).location(`/api/items/${item.id}`).json(item);
};

// PUT /api/items/:id — новый файл заменяет старый, removeFile=true удаляет вложение
exports.update = async (req, res) => {
  const existing = await findOwnItem(req, 'изменять');
  const { title, description } = validated(req.body);

  let filePath = existing.file_path;
  if (req.file) filePath = uploadedPath(req.file);
  else if (String(req.body.removeFile) === 'true') filePath = null;

  const { rows: [item] } = await pool.query(
    'UPDATE items SET title = $1, description = $2, file_path = $3 WHERE id = $4 RETURNING *',
    [title, description, filePath, existing.id]
  );
  if (filePath !== existing.file_path) await removeUpload(existing.file_path);

  logger.info('Запись изменена', { userId: req.user.id, itemId: item.id });
  res.status(200).json(item);
};

// DELETE /api/items/:id
exports.remove = async (req, res) => {
  const item = await findOwnItem(req, 'удалять');
  await pool.query('DELETE FROM items WHERE id = $1', [item.id]);
  await removeUpload(item.file_path);

  logger.info('Запись удалена', { userId: req.user.id, itemId: item.id });
  res.status(204).end();
};
