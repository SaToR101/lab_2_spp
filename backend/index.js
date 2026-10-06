const config = require('./config');
const logger = require('./utils/logger');

const missing = config.validate();
if (missing.length) {
  logger.error('Не заданы обязательные переменные окружения', { missing });
  process.exit(1);
}

const app = require('./app');
const pool = require('./db');
const initDb = require('./initDb');
const mailer = require('./utils/mailer');

const start = async () => {
  await initDb();
  // Не блокирует запуск: если почта не настроена, в логе сразу будет понятная ошибка с подсказкой
  mailer.verify();

  const server = app.listen(config.port, () => logger.info('Сервер запущен', { port: config.port }));

  const shutdown = (signal) => {
    logger.info('Получен сигнал завершения', { signal });
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((err) => {
  logger.error('Не удалось запустить сервер', { err });
  process.exit(1);
});
