const test = require('node:test');
const assert = require('node:assert/strict');
const { validateEmail, validatePassword, validateItem, parseId, normalizeEmail } = require('../utils/validators');

test('validateEmail: корректные и некорректные адреса', () => {
  assert.deepEqual(validateEmail('user@example.com'), []);
  assert.equal(validateEmail('user@').length, 1);
  assert.equal(validateEmail('без-собаки').length, 1);
  assert.equal(validateEmail(undefined).length, 1);
  assert.equal(validateEmail(123).length, 1);
});

test('validatePassword: длина, буквы и цифры', () => {
  assert.deepEqual(validatePassword('Abcdef12'), []);
  assert.ok(validatePassword('short1').length > 0);
  assert.ok(validatePassword('onlyletters').length > 0);
  assert.ok(validatePassword('12345678').length > 0);
  assert.ok(validatePassword(undefined).length > 0);
  assert.ok(validatePassword('a1'.repeat(40)).length > 0);
});

test('validateItem: обязательные поля и ограничения длины', () => {
  assert.deepEqual(validateItem({ title: 'Заголовок', description: 'Описание' }), []);
  assert.equal(validateItem({ title: '  ', description: 'x' }).length, 1);
  assert.equal(validateItem({ title: 'x', description: '' }).length, 1);
  assert.equal(validateItem({}).length, 2);
  assert.equal(validateItem({ title: 'x'.repeat(256), description: 'x' }).length, 1);
});

test('parseId: только положительные целые', () => {
  assert.equal(parseId('42'), 42);
  assert.equal(parseId('0'), null);
  assert.equal(parseId('-1'), null);
  assert.equal(parseId('abc'), null);
  assert.equal(parseId('1.5'), null);
  assert.equal(parseId('99999999999'), null);
});

test('normalizeEmail: нижний регистр и обрезка пробелов', () => {
  assert.equal(normalizeEmail('  User@Example.COM '), 'user@example.com');
});
