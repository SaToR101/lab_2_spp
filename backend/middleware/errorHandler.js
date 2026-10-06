const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { removeUpload, uploadedPath } = require('./upload');

// 404 для неизвестных маршрутов API
exports.notFound = (req, res, next) => {
  next(AppError.notFound(`Маршрут ${req.method} ${req.originalUrl} не найден`));
};

// Приводит любую ошибку к AppError с корректным HTTP-статусом
const toAppError = (err) => {
  if (err instanceof AppError) return err;
  if (err.type === 'entity.parse.failed') return AppError.badRequest('Некорректный JSON в теле запроса');
  if (err.type === 'entity.too.large') return AppError.payloadTooLarge('Тело запроса слишком большое');
  if (err.name === 'MulterError') {
    return err.code === 'LIMIT_FILE_SIZE'
      ? AppError.payloadTooLarge('Файл слишком большой')
      : AppError.badRequest(`Ошибка загрузки файла: ${err.message}`);
  }
  return new AppError(500, 'Internal Server Error', 'Внутренняя ошибка сервера');
};

// Единый обработчик ошибок: всегда отвечает JSON { error, message, code, details? }
exports.errorHandler = async (err, req, res, _next) => {
  const appErr = toAppError(err);

  if (appErr.status >= 500) {
    logger.error('Ошибка при обработке запроса', { requestId: req.id, url: req.originalUrl, err });
  }

  // Запрос отклонён — загруженный файл больше не нужен
  if (req.file) await removeUpload(uploadedPath(req.file));

  if (appErr.retryAfter) res.set('Retry-After', String(appErr.retryAfter));
  const body = { error: appErr.error, message: appErr.message, code: appErr.status };
  if (appErr.details) body.details = appErr.details;
  res.status(appErr.status).json(body);
};
