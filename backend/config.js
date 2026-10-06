// Единая точка чтения настроек из переменных окружения.
// Значения задаются в docker-compose.yml, секреты — в файле .env рядом с ним (см. .env.example).
const env = process.env;

const num = (value, fallback) => {
  const n = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(n) ? n : fallback;
};

const bool = (value, fallback) => (value === undefined || value === '' ? fallback : value === 'true');

const smtpPort = num(env.SMTP_PORT, 1025);

const config = {
  port: num(env.PORT, 5000),
  databaseUrl: env.DATABASE_URL || 'postgres://user:password@db:5432/appdb',

  // Временные ключи: access-JWT живёт недолго, refresh-токен — случайная строка, хеш которой хранится в БД
  jwtAccessSecret: env.JWT_ACCESS_SECRET,
  accessTtl: env.JWT_ACCESS_TTL || '15m',
  refreshTtlMs: num(env.JWT_REFRESH_TTL_MS, 7 * 24 * 3600 * 1000),

  // Защита от подбора пароля
  maxFailedAttempts: num(env.MAX_FAILED_ATTEMPTS, 5),
  lockMinutes: num(env.LOCK_MINUTES, 15),
  loginIpLimit: num(env.LOGIN_IP_LIMIT, 20),

  // Контроль активных подключений
  maxSessions: num(env.MAX_SESSIONS, 5),

  // Почта. По умолчанию — локальный Mailpit (http://localhost:8025); для реальной почты см. .env.example
  smtp: {
    host: env.SMTP_HOST || 'mailpit',
    port: smtpPort,
    secure: bool(env.SMTP_SECURE, smtpPort === 465), // 465 — TLS сразу, 587/25/1025 — STARTTLS при наличии
    user: env.SMTP_USER || '',
    pass: (env.SMTP_PASS || '').replace(/\s+/g, ''), // пароли приложений Google копируются с пробелами
    from: env.MAIL_FROM || env.SMTP_USER || 'no-reply@spp.local',
    timeoutMs: num(env.SMTP_TIMEOUT_MS, 10000)
  },
  frontendUrl: (env.FRONTEND_URL || 'http://localhost:8080').replace(/\/+$/, ''),
  resetTtlMs: num(env.RESET_TTL_MS, 3600 * 1000),

  // Администратор по умолчанию (создаётся при первом запуске)
  adminEmail: env.ADMIN_EMAIL || 'admin@example.com',
  adminPassword: env.ADMIN_PASSWORD || 'Admin12345',

  maxFileSize: num(env.MAX_FILE_SIZE, 5 * 1024 * 1024)
};

// Обязательные переменные проверяются при старте, а не на первом запросе
config.validate = () => (config.jwtAccessSecret ? [] : ['JWT_ACCESS_SECRET']);

module.exports = config;
