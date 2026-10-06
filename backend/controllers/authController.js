const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const config = require('../config');
const logger = require('../utils/logger');
const mailer = require('../utils/mailer');
const AppError = require('../utils/AppError');
const { ROLE } = require('../utils/permissions');
const { validateEmail, validatePassword, normalizeEmail, parseId } = require('../utils/validators');

const BCRYPT_ROUNDS = 10;

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const randomToken = (bytes) => crypto.randomBytes(bytes).toString('hex');

// Хеш-пустышка: сравниваем с ним, если пользователя нет, чтобы время ответа не выдавало существование email
const DUMMY_HASH = bcrypt.hashSync('dummy-password-1', BCRYPT_ROUNDS);

const publicUser = (u) => ({ id: u.id, email: u.email, role_id: u.role_id });

const signAccessToken = (userId, roleId, sid) =>
  jwt.sign({ id: userId, role_id: roleId, sid }, config.jwtAccessSecret, { expiresIn: config.accessTtl });

const secondsUntil = (date) => Math.max(1, Math.ceil((new Date(date).getTime() - Date.now()) / 1000));

const lockedError = (until) => {
  const retryAfter = secondsUntil(until);
  return AppError.tooManyRequests(
    `Аккаунт временно заблокирован из-за множества неудачных попыток входа. Повторите через ${Math.ceil(retryAfter / 60)} мин.`,
    retryAfter
  );
};

// Создаёт сессию (запись refresh-токена) и выдаёт пару временных ключей
const issueSession = async (user, req) => {
  const refreshToken = randomToken(48);
  const { rows } = await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [user.id, sha256(refreshToken), (req.get('user-agent') || '').slice(0, 300), req.ip, new Date(Date.now() + config.refreshTtlMs)]
  );
  const sid = rows[0].id;

  // Контроль активных подключений: удаляем просроченные и оставляем не больше maxSessions последних
  const { rowCount } = await pool.query(
    `DELETE FROM refresh_tokens
      WHERE user_id = $1
        AND (expires_at < NOW()
             OR id NOT IN (SELECT id FROM refresh_tokens WHERE user_id = $1 ORDER BY last_used_at DESC LIMIT $2))`,
    [user.id, config.maxSessions]
  );
  if (rowCount > 0) logger.info('Старые сессии завершены (лимит подключений)', { userId: user.id, removed: rowCount });

  return { accessToken: signAccessToken(user.id, user.role_id, sid), refreshToken, sid };
};

// POST /api/auth/register
exports.register = async (req, res) => {
  const { email, password } = req.body || {};
  const errors = [...validateEmail(email), ...validatePassword(password)];
  if (errors.length) throw AppError.badRequest('Ошибка валидации', errors);

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, role_id) VALUES ($1, $2, $3) RETURNING id, email, role_id',
      [normalizeEmail(email), hash, ROLE.USER]
    );
    logger.info('Зарегистрирован новый пользователь', { userId: rows[0].id });
    res.status(201).json({ message: 'Успешная регистрация', user: rows[0] });
  } catch (err) {
    if (err.code === '23505') throw AppError.conflict('Пользователь с таким email уже существует');
    throw err;
  }
};

// POST /api/auth/login — с защитой от подбора: блокировка аккаунта + лимит неудачных попыток по IP
exports.login = async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    throw AppError.badRequest('Укажите email и пароль');
  }

  const normalized = normalizeEmail(email);
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [normalized]);
  const user = rows[0];

  if (user?.locked_until && new Date(user.locked_until) > new Date()) {
    logger.warn('Попытка входа в заблокированный аккаунт', { userId: user.id, ip: req.ip });
    throw lockedError(user.locked_until);
  }

  const valid = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !valid) {
    logger.warn('Неудачная попытка входа', { email: normalized, ip: req.ip });
    if (user) {
      const { rows: [updated] } = await pool.query(
        `UPDATE users
            SET locked_until    = CASE WHEN failed_attempts + 1 >= $2 THEN NOW() + make_interval(mins => $3::int) END,
                failed_attempts = CASE WHEN failed_attempts + 1 >= $2 THEN 0 ELSE failed_attempts + 1 END
          WHERE id = $1
      RETURNING locked_until`,
        [user.id, config.maxFailedAttempts, config.lockMinutes]
      );
      if (updated.locked_until) {
        logger.warn('Аккаунт заблокирован из-за подбора пароля', { userId: user.id, ip: req.ip });
        throw lockedError(updated.locked_until);
      }
    }
    throw AppError.unauthorized('Неверный email или пароль');
  }

  await pool.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);
  const { accessToken, refreshToken, sid } = await issueSession(user, req);

  logger.info('Пользователь вошёл в систему', { userId: user.id, sessionId: sid, ip: req.ip });
  res.status(200).json({ accessToken, refreshToken, user: publicUser(user) });
};

// POST /api/auth/refresh — новый access-токен по refresh-токену
exports.refresh = async (req, res) => {
  const { refreshToken } = req.body || {};
  if (typeof refreshToken !== 'string' || !refreshToken) throw AppError.badRequest('Refresh-токен не предоставлен');

  const { rows: [session] } = await pool.query(
    `UPDATE refresh_tokens s SET last_used_at = NOW()
       FROM users u
      WHERE u.id = s.user_id AND s.token_hash = $1 AND s.expires_at > NOW()
  RETURNING s.id AS sid, u.id, u.email, u.role_id`,
    [sha256(refreshToken)]
  );
  if (!session) throw AppError.unauthorized('Refresh-токен недействителен или истёк');

  logger.info('Access-токен обновлён', { userId: session.id, sessionId: session.sid });
  res.status(200).json({ accessToken: signAccessToken(session.id, session.role_id, session.sid), user: publicUser(session) });
};

// POST /api/auth/logout — завершает текущую сессию
exports.logout = async (req, res) => {
  const { refreshToken } = req.body || {};
  if (typeof refreshToken === 'string' && refreshToken) {
    const { rows } = await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1 RETURNING user_id', [sha256(refreshToken)]);
    if (rows.length) logger.info('Пользователь вышел из системы', { userId: rows[0].user_id });
  }
  res.status(204).end();
};

// GET /api/auth/me
exports.me = (req, res) => {
  res.status(200).json({ user: publicUser(req.user) });
};

// GET /api/auth/sessions — активные подключения пользователя
exports.listSessions = async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, user_agent, ip_address, created_at, last_used_at
       FROM refresh_tokens
      WHERE user_id = $1 AND expires_at > NOW()
      ORDER BY last_used_at DESC`,
    [req.user.id]
  );
  res.status(200).json(rows.map((s) => ({ ...s, current: s.id === req.user.sid })));
};

// DELETE /api/auth/sessions/:id — завершение выбранного подключения
exports.revokeSession = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw AppError.badRequest('Некорректный id сессии');

  const { rowCount } = await pool.query('DELETE FROM refresh_tokens WHERE id = $1 AND user_id = $2', [id, req.user.id]);
  if (rowCount === 0) throw AppError.notFound('Сессия не найдена');

  logger.info('Сессия завершена пользователем', { userId: req.user.id, sessionId: id });
  res.status(204).end();
};

// POST /api/auth/forgot-password — письмо со ссылкой для сброса пароля
exports.forgotPassword = async (req, res) => {
  const { email } = req.body || {};
  const errors = validateEmail(email);
  if (errors.length) throw AppError.badRequest('Ошибка валидации', errors);

  const normalized = normalizeEmail(email);
  const { rows: [user] } = await pool.query('SELECT id FROM users WHERE email = $1', [normalized]);

  if (user) {
    const resetToken = randomToken(32);
    await pool.query(
      'UPDATE users SET reset_token_hash = $1, reset_expires = $2 WHERE id = $3',
      [sha256(resetToken), new Date(Date.now() + config.resetTtlMs), user.id]
    );
    try {
      await mailer.sendResetEmail(normalized, `${config.frontendUrl}/?reset_token=${resetToken}`);
    } catch {
      // Раньше ошибка SMTP молча проглатывалась и клиент видел «письмо отправлено». Теперь — честный 503.
      // Подробности (код ошибки SMTP и подсказка) уже записаны в лог в mailer.
      throw AppError.serviceUnavailable('Не удалось отправить письмо: почтовый сервис недоступен. Попробуйте позже.');
    }
    logger.info('Отправлена ссылка сброса пароля', { userId: user.id });
  } else {
    logger.warn('Запрос сброса пароля для несуществующего email', { ip: req.ip });
  }

  // Ответ одинаковый для существующих и несуществующих email — чтобы нельзя было перебирать адреса
  res.status(200).json({ message: 'Если такой email зарегистрирован, на него отправлена ссылка для сброса пароля' });
};

// POST /api/auth/reset-password — новый пароль по ссылке из письма
exports.resetPassword = async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw AppError.badRequest('Ссылка недействительна или устарела');

  const errors = validatePassword(password);
  if (errors.length) throw AppError.badRequest('Ошибка валидации', errors);

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  // Токен одноразовый: проверка и сброс в одном запросе
  const { rows: [user] } = await pool.query(
    `UPDATE users
        SET password_hash = $1, reset_token_hash = NULL, reset_expires = NULL, failed_attempts = 0, locked_until = NULL
      WHERE reset_token_hash = $2 AND reset_expires > NOW()
  RETURNING id`,
    [hash, sha256(token)]
  );
  if (!user) throw AppError.badRequest('Ссылка недействительна или устарела');

  // После смены пароля завершаем все активные подключения
  await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);

  logger.info('Пароль изменён через восстановление', { userId: user.id });
  res.status(200).json({ message: 'Пароль успешно изменён. Войдите с новым паролем.' });
};
