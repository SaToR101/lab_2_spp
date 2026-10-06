const crypto = require('crypto');
const logger = require('../utils/logger');

// Логирует каждый HTTP-запрос одной JSON-строкой: метод, путь, статус, время, IP, пользователь
module.exports = (req, res, next) => {
  const requestId = req.headers['x-request-id'] || crypto.randomUUID();
  const startedAt = process.hrtime.bigint();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[level]('HTTP запрос', {
      requestId,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
      ip: req.ip,
      userId: req.user ? req.user.id : undefined
    });
  });

  next();
};
