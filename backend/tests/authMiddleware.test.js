process.env.JWT_ACCESS_SECRET = 'test-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

// Подменяем модуль БД, чтобы тест не требовал PostgreSQL
const dbPath = require.resolve('../db');
let queryImpl = async () => ({ rows: [] });
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: (...args) => queryImpl(...args) } };

const { verifyToken, checkRole } = require('../middleware/authMiddleware');

const call = async (middleware, req) => {
  let error = null;
  let called = false;
  await middleware(req, {}, (err) => { called = true; error = err || null; });
  return { called, error };
};

test('verifyToken: без заголовка — 401', async () => {
  const { error } = await call(verifyToken, { headers: {} });
  assert.equal(error.status, 401);
});

test('verifyToken: мусорный токен — 401', async () => {
  const { error } = await call(verifyToken, { headers: { authorization: 'Bearer abc.def.ghi' } });
  assert.equal(error.status, 401);
});

test('verifyToken: просроченный токен — 401', async () => {
  const token = jwt.sign({ id: 1, sid: 1 }, 'test-secret', { expiresIn: -10 });
  const { error } = await call(verifyToken, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(error.status, 401);
});

test('verifyToken: сессия не найдена в БД — 401', async () => {
  queryImpl = async () => ({ rows: [] });
  const token = jwt.sign({ id: 1, role_id: 2, sid: 5 }, 'test-secret', { expiresIn: '5m' });
  const { error } = await call(verifyToken, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(error.status, 401);
});

test('verifyToken: валидный токен кладёт пользователя в req.user', async () => {
  queryImpl = async () => ({ rows: [{ id: 1, email: 'a@b.cc', role_id: 3 }] });
  const token = jwt.sign({ id: 1, role_id: 2, sid: 5 }, 'test-secret', { expiresIn: '5m' });
  const req = { headers: { authorization: `Bearer ${token}` } };
  const { error, called } = await call(verifyToken, req);
  assert.equal(error, null);
  assert.ok(called);
  // роль берётся из БД, а не из токена
  assert.equal(req.user.role_id, 3);
  assert.equal(req.user.sid, 5);
});

test('checkRole: подходящая роль проходит, неподходящая — 403', async () => {
  const guard = checkRole([2, 3]);
  assert.equal((await call(guard, { user: { role_id: 2 } })).error, null);
  assert.equal((await call(guard, { user: { role_id: 1 } })).error.status, 403);
  assert.equal((await call(guard, {})).error.status, 403);
});
