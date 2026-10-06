// Ошибка с HTTP-статусом. Обработчик ошибок превращает её в JSON-ответ { error, message, code, details? }.
class AppError extends Error {
  constructor(status, error, message, { details, retryAfter } = {}) {
    super(message);
    this.status = status;
    this.error = error;
    this.details = details;
    this.retryAfter = retryAfter; // секунды, уходит в заголовок Retry-After
  }
}

AppError.badRequest = (message, details) => new AppError(400, 'Bad Request', message, { details });
AppError.unauthorized = (message) => new AppError(401, 'Unauthorized', message);
AppError.forbidden = (message) => new AppError(403, 'Forbidden', message);
AppError.notFound = (message) => new AppError(404, 'Not Found', message);
AppError.conflict = (message) => new AppError(409, 'Conflict', message);
AppError.payloadTooLarge = (message) => new AppError(413, 'Payload Too Large', message);
AppError.unsupportedMediaType = (message) => new AppError(415, 'Unsupported Media Type', message);
AppError.tooManyRequests = (message, retryAfter) => new AppError(429, 'Too Many Requests', message, { retryAfter });
AppError.serviceUnavailable = (message) => new AppError(503, 'Service Unavailable', message);

module.exports = AppError;
