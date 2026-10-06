// Модель доступа: 1 — Гость (только чтение), 2 — Пользователь (свои записи), 3 — Администратор (всё)
const ROLE = Object.freeze({ GUEST: 1, USER: 2, ADMIN: 3 });
const ALL_ROLES = Object.values(ROLE);

// Изменять/удалять запись можно: админу — любую, пользователю — только свою, гостю — ничего
const canModifyItem = (user, item) => {
  if (!user || !item) return false;
  if (user.role_id === ROLE.ADMIN) return true;
  return user.role_id === ROLE.USER && item.owner_id !== null && item.owner_id === user.id;
};

module.exports = { ROLE, ALL_ROLES, canModifyItem };
