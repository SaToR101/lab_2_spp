// Валидация входящих данных. Каждая функция возвращает массив ошибок (пустой = всё хорошо).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const validateEmail = (email) => {
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim()) || email.length > 254) {
    return ['Некорректный email'];
  }
  return [];
};

const validatePassword = (password) => {
  const errors = [];
  if (typeof password !== 'string' || password.length < 8) {
    errors.push('Пароль должен содержать минимум 8 символов');
  } else {
    if (password.length > 72) errors.push('Пароль не должен быть длиннее 72 символов');
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      errors.push('Пароль должен содержать буквы и цифры');
    }
  }
  return errors;
};

const validateItem = ({ title, description }) => {
  const errors = [];
  if (typeof title !== 'string' || title.trim().length === 0) {
    errors.push('Заголовок обязателен');
  } else if (title.trim().length > 255) {
    errors.push('Заголовок не должен быть длиннее 255 символов');
  }
  if (typeof description !== 'string' || description.trim().length === 0) {
    errors.push('Описание обязательно');
  } else if (description.length > 5000) {
    errors.push('Описание не должно быть длиннее 5000 символов');
  }
  return errors;
};

// id в URL должен быть положительным целым числом
const parseId = (value) => {
  if (!/^\d+$/.test(String(value))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : null;
};

const normalizeEmail = (email) => String(email).trim().toLowerCase();

module.exports = { validateEmail, validatePassword, validateItem, parseId, normalizeEmail };
