process.env.JWT_ACCESS_SECRET = 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');

// Подменяем БД и почту, чтобы тест не требовал PostgreSQL и SMTP
const stub = (path, exports) => {
  const resolved = require.resolve(path);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};
let users = [];
let sendImpl = async () => ({});
stub('../db', { query: async (sql) => ({ rows: sql.startsWith('SELECT') ? users : [] }) });
stub('../utils/mailer', { sendResetEmail: (...args) => sendImpl(...args) });

const { forgotPassword } = require('../controllers/authController');

const call = async (email) => {
  const res = { statusCode: null, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  try {
    await forgotPassword({ body: { email }, ip: '127.0.0.1' }, res);
    return { status: res.statusCode };
  } catch (err) {
    return { status: err.status };
  }
};

const quiet = async (fn) => {
  const out = process.stdout.write;
  process.stdout.write = () => true;
  try { return await fn(); } finally { process.stdout.write = out; }
};

test('forgot-password: письмо отправлено — 200, ссылка содержит токен', async () => {
  users = [{ id: 1 }];
  let link;
  sendImpl = async (to, url) => { link = url; };
  assert.equal((await quiet(() => call('user@example.com'))).status, 200);
  assert.match(link, /\/\?reset_token=[a-f0-9]{64}$/);
});

test('forgot-password: сбой SMTP больше не скрывается — 503', async () => {
  users = [{ id: 1 }];
  sendImpl = async () => { throw new Error('ECONNREFUSED'); };
  assert.equal((await quiet(() => call('user@example.com'))).status, 503);
});

test('forgot-password: неизвестный email — тот же ответ 200 (без перебора адресов)', async () => {
  users = [];
  assert.equal((await quiet(() => call('nobody@example.com'))).status, 200);
});

test('forgot-password: некорректный email — 400', async () => {
  assert.equal((await call('not-an-email')).status, 400);
});
