const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('./logger');

const { smtp } = config;

// Один транспорт на всё приложение. Явные таймауты обязательны: по умолчанию nodemailer ждёт
// соединения до 2 минут, и запрос «висит» дольше таймаута nginx (60 с) — клиент получает 504.
const transporter = nodemailer.createTransport({
  host: smtp.host,
  port: smtp.port,
  secure: smtp.secure,
  auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  connectionTimeout: smtp.timeoutMs,
  greetingTimeout: smtp.timeoutMs,
  socketTimeout: smtp.timeoutMs * 2
});

// Подсказка по типичным причинам сбоя — попадает в лог, чтобы проблему было видно сразу
const HINTS = {
  EAUTH: 'SMTP отклонил логин/пароль. Для Gmail нужен «пароль приложения», а не обычный пароль',
  EDNS: 'Не удалось найти SMTP-хост — проверьте SMTP_HOST',
  ECONNECTION: 'Не удалось подключиться к SMTP — проверьте SMTP_HOST, SMTP_PORT и SMTP_SECURE',
  ESOCKET: 'Ошибка TLS/сокета — проверьте соответствие SMTP_PORT и SMTP_SECURE (465 — true, 587 — false)',
  ETIMEDOUT: 'SMTP не ответил вовремя — порт может быть заблокирован провайдером или файрволом',
  EENVELOPE: 'Адрес отправителя или получателя отклонён — MAIL_FROM обычно должен совпадать с SMTP_USER'
};

const describe = (err) => ({
  code: err.code,
  responseCode: err.responseCode,
  message: err.message,
  hint: HINTS[err.code]
});

// Проверка соединения при старте: сервер не падает, но в логе сразу видно, что почта не настроена
exports.verify = async () => {
  try {
    await transporter.verify();
    logger.info('SMTP-сервер доступен', { host: smtp.host, port: smtp.port });
    return true;
  } catch (err) {
    logger.error('SMTP-сервер недоступен: письма отправляться не будут', { host: smtp.host, port: smtp.port, ...describe(err) });
    return false;
  }
};

exports.sendResetEmail = async (to, resetUrl) => {
  const minutes = Math.round(config.resetTtlMs / 60000);
  try {
    const info = await transporter.sendMail({
      from: smtp.from,
      to,
      subject: 'Восстановление доступа к системе',
      text: `Для сброса пароля перейдите по ссылке: ${resetUrl}\nСсылка действует ${minutes} мин.\n\nЕсли вы не запрашивали сброс, просто проигнорируйте это письмо.`,
      html: `<p>Для сброса пароля перейдите по ссылке:</p>
<p><a href="${resetUrl}">${resetUrl}</a></p>
<p>Ссылка действует ${minutes} мин. Если вы не запрашивали сброс, просто проигнорируйте это письмо.</p>`
    });
    if (info.rejected.length) {
      throw Object.assign(new Error(`Получатель отклонён: ${info.rejected.join(', ')}`), { code: 'EENVELOPE' });
    }
    return info;
  } catch (err) {
    logger.error('Не удалось отправить письмо', { host: smtp.host, port: smtp.port, ...describe(err) });
    throw err;
  }
};
