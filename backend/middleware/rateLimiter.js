const rateLimit = require('express-rate-limit');

// Ограничение попыток входа: максимум 5 запросов за 15 минут с одного IP
exports.loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: {
        error: 'Too Many Requests',
        message: 'Слишком много неудачных попыток входа. Попробуйте через 15 минут.',
        code: 429
    },
    standardHeaders: true,
    legacyHeaders: false,
});