const test = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../utils/AppError');
const { errorHandler, notFound } = require('../middleware/errorHandler');

const run = (err) => {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
  errorHandler(err, { id: 'test', originalUrl: '/x' }, res, () => {});
  return res;
};

test('AppError превращается в JSON с нужным статусом', () => {
  const res = run(AppError.notFound('Нет такого'));
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Not Found', message: 'Нет такого', code: 404 });
});

test('ошибки валидации содержат details', () => {
  const res = run(AppError.badRequest('Ошибка валидации', ['a', 'b']));
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body.details, ['a', 'b']);
});

test('битый JSON даёт 400', () => {
  assert.equal(run({ type: 'entity.parse.failed' }).statusCode, 400);
});

test('слишком большой файл даёт 413', () => {
  assert.equal(run({ name: 'MulterError', code: 'LIMIT_FILE_SIZE', message: 'x' }).statusCode, 413);
});

test('неизвестная ошибка даёт 500 без утечки подробностей', () => {
  const res = run(new Error('секретные детали БД'));
  assert.equal(res.statusCode, 500);
  assert.ok(!res.body.message.includes('секретные'));
});

test('notFound передаёт 404 дальше', () => {
  let received;
  notFound({ method: 'GET', originalUrl: '/api/nope' }, {}, (e) => { received = e; });
  assert.equal(received.status, 404);
});

test('429 выставляет заголовок Retry-After', () => {
  const headers = {};
  const res = {
    set(k, v) { headers[k] = v; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
  errorHandler(AppError.tooManyRequests('Подождите', 90), { originalUrl: '/x' }, res, () => {});
  assert.equal(res.statusCode, 429);
  assert.equal(headers['Retry-After'], '90');
});
