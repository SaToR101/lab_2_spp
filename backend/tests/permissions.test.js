const test = require('node:test');
const assert = require('node:assert/strict');
const { canModifyItem } = require('../utils/permissions');

const item = { id: 10, owner_id: 2 };

test('гость не может менять и удалять ничего', () => {
  assert.equal(canModifyItem({ id: 5, role_id: 1 }, item), false);
  assert.equal(canModifyItem({ id: 2, role_id: 1 }, item), false);
});

test('пользователь меняет и удаляет только свои записи', () => {
  assert.equal(canModifyItem({ id: 2, role_id: 2 }, item), true);
  assert.equal(canModifyItem({ id: 3, role_id: 2 }, item), false);
});

test('запись без владельца недоступна обычному пользователю', () => {
  assert.equal(canModifyItem({ id: 2, role_id: 2 }, { id: 1, owner_id: null }), false);
});

test('администратор меняет и удаляет любые записи', () => {
  assert.equal(canModifyItem({ id: 1, role_id: 3 }, item), true);
  assert.equal(canModifyItem({ id: 1, role_id: 3 }, { id: 1, owner_id: null }), true);
});

test('нет пользователя или записи — доступа нет', () => {
  assert.equal(canModifyItem(null, item), false);
  assert.equal(canModifyItem({ id: 1, role_id: 3 }, null), false);
});
