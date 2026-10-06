const rateLimit = require('express-rate-limit');
const config = require('../config');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

const MINUTE = 60 * 1000;

const createLimiter = (name, { windowMs, limit, message, skipSuccessfulRequests = false }) => rateLimit({
  windowMs,
  limit,
  skipSuccessfulRequests,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res, next) => {
    logger.warn('Превышен лимит запросов', { limiter: name, ip: req.ip, url: req.originalUrl });
    const resetMs = req.rateLimit.resetTime ? req.rateLimit.resetTime - Date.now() : windowMs;
    next(AppError.tooManyRequests(message, Math.max(1, Math.ceil(resetMs / 1000))));
  }
});

// Вход: считаются только неудачные попытки с одного IP
exports.loginLimiter = createLimiter('login', {
  windowMs: 15 * MINUTE,
  limit: config.loginIpLimit,
  skipSuccessfulRequests: true,
  message: 'Слишком много неудачных попыток входа с вашего IP. Попробуйте через 15 минут.'
});

// Восстановление пароля: защита от спама письмами
exports.forgotLimiter = createLimiter('forgot-password', {
  windowMs: 60 * MINUTE,
  limit: 5,
  message: 'Слишком много запросов на восстановление. Попробуйте через час.'
});
