const test = require('node:test');
const assert = require('node:assert/strict');
const logger = require('../utils/logger');

const capture = (stream, fn) => {
  const original = stream.write;
  const chunks = [];
  stream.write = (chunk) => { chunks.push(String(chunk)); return true; };
  try { fn(); } finally { stream.write = original; }
  return chunks.join('');
};

test('logger пишет одну JSON-строку с time, level, msg и полями', () => {
  const out = capture(process.stdout, () => logger.info('Тест', { userId: 7 }));
  const entry = JSON.parse(out.trim());
  assert.equal(entry.level, 'info');
  assert.equal(entry.msg, 'Тест');
  assert.equal(entry.userId, 7);
  assert.ok(!Number.isNaN(Date.parse(entry.time)));
});

test('logger сериализует Error и пишет ошибки в stderr', () => {
  const out = capture(process.stderr, () => logger.error('Сбой', { err: new Error('boom') }));
  const entry = JSON.parse(out.trim());
  assert.equal(entry.level, 'error');
  assert.equal(entry.err.message, 'boom');
  assert.ok(entry.err.stack);
});
