const ROLE = { GUEST: 1, USER: 2, ADMIN: 3 };
const ROLE_NAMES = { [ROLE.GUEST]: 'Гость', [ROLE.USER]: 'Пользователь', [ROLE.ADMIN]: 'Администратор' };
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

const $ = (id) => document.getElementById(id);

const state = {
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken'),
  user: null,
  items: []
};

/* ---------- Уведомления ---------- */
let alertTimer = null;
const showAlert = (msg, isError = false) => {
  const box = $('alert');
  box.textContent = msg;
  box.className = `alert ${isError ? 'error' : 'success'}`;
  clearTimeout(alertTimer);
  alertTimer = setTimeout(() => { box.className = 'alert hidden'; }, isError ? 8000 : 5000);
};
const showError = (err) => showAlert(err.message, true);

/* ---------- Работа с сетью ---------- */
const NETWORK_ERRORS = {
  413: 'Файл слишком большой',
  502: 'Сервер временно недоступен',
  503: 'Сервер временно недоступен',
  504: 'Сервер не ответил вовремя'
};

// Превращает ответ с ошибкой в Error с понятным сообщением (сервер отвечает { error, message, code, details? })
const parseError = async (res) => {
  const data = (res.headers.get('content-type') || '').includes('application/json')
    ? await res.json().catch(() => null)
    : null;
  let message = data?.message || NETWORK_ERRORS[res.status] || `Ошибка сервера (${res.status})`;
  if (Array.isArray(data?.details) && data.details.length) message += `: ${data.details.join('; ')}`;
  return Object.assign(new Error(message), { status: res.status });
};

const saveTokens = () => {
  for (const key of ['accessToken', 'refreshToken']) {
    if (state[key]) localStorage.setItem(key, state[key]);
    else localStorage.removeItem(key);
  }
};

// Параллельные запросы с истёкшим токеном ждут одно общее обновление
let refreshPromise = null;
const refreshAccessToken = () => {
  refreshPromise ??= (async () => {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: state.refreshToken })
    });
    if (!res.ok) throw await parseError(res);
    const data = await res.json();
    state.accessToken = data.accessToken;
    state.user = data.user;
    saveTokens();
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
};

const localLogout = () => {
  Object.assign(state, { accessToken: null, refreshToken: null, user: null });
  saveTokens();
  showView('auth');
  showAuthForm('loginForm');
};

const request = async (method, url, { json, formData, auth = true } = {}) => {
  const send = () => {
    const headers = {};
    if (auth && state.accessToken) headers.Authorization = `Bearer ${state.accessToken}`;
    if (json !== undefined) headers['Content-Type'] = 'application/json';
    // Для FormData Content-Type с boundary браузер выставит сам
    const body = json !== undefined ? JSON.stringify(json) : formData;
    return fetch(url, { method, headers, body });
  };

  let res;
  try {
    res = await send();
    if (res.status === 401 && auth && state.refreshToken) {
      try {
        await refreshAccessToken();
      } catch {
        localLogout();
        throw new Error('Сессия истекла. Выполните вход заново.');
      }
      res = await send();
    }
  } catch (err) {
    throw err instanceof TypeError ? new Error('Нет связи с сервером') : err;
  }

  if (!res.ok) {
    const err = await parseError(res);
    if (err.status === 401 && auth) localLogout();
    throw err;
  }
  return res.status === 204 ? null : res.json();
};

/* ---------- DOM-помощники ---------- */
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const button = (label, className, onClick) => {
  const btn = el('button', `btn ${className}`, label);
  btn.type = 'button';
  btn.addEventListener('click', onClick);
  return btn;
};

const card = (infoNodes, actionNodes = []) => {
  const node = el('div', 'item-card');
  const info = el('div', 'item-info');
  const actions = el('div', 'item-actions');
  info.append(...infoNodes);
  actions.append(...actionNodes);
  node.append(info, actions);
  return node;
};

const renderList = (containerId, nodes, emptyText) => {
  $(containerId).replaceChildren(...(nodes.length ? nodes : [el('p', 'empty-state', emptyText)]));
};

// Блокирует кнопки на время запроса: защита от двойной отправки и видимый отклик
const withBusy = async (root, fn) => {
  const buttons = root.querySelectorAll('button');
  buttons.forEach((b) => { b.disabled = true; });
  try {
    return await fn();
  } finally {
    buttons.forEach((b) => { b.disabled = false; });
  }
};

// Обработчик отправки формы: без перезагрузки страницы, с блокировкой и выводом ошибок
const onSubmit = (formId, handler) => {
  const form = $(formId);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    withBusy(form, handler).catch(showError);
  });
};

const formatDate = (value) => new Date(value).toLocaleString('ru-RU');
const fileName = (filePath) => filePath.split('/').pop();

/* ---------- Экраны ---------- */
const VIEWS = ['auth', 'app', 'sessions', 'users'];
const AUTH_FORMS = ['loginForm', 'registerForm', 'forgotForm', 'resetForm'];

function showView(name) {
  VIEWS.forEach((v) => $(`${v}View`).classList.toggle('hidden', v !== name));
  $('userBar').classList.toggle('hidden', !state.user || name === 'auth');
  if (state.user) {
    $('userInfo').textContent = `${state.user.email} · ${ROLE_NAMES[state.user.role_id] ?? state.user.role_id}`;
    $('usersBtn').classList.toggle('hidden', state.user.role_id !== ROLE.ADMIN);
  }
}

function showAuthForm(formId) {
  AUTH_FORMS.forEach((id) => $(id).classList.toggle('hidden', id !== formId));
}

document.querySelectorAll('[data-show]').forEach((btn) => {
  btn.addEventListener('click', () => showAuthForm(btn.dataset.show));
});

/* ---------- Авторизация ---------- */
const enterApp = async () => {
  showView('app');
  $('itemForm').classList.toggle('hidden', state.user.role_id === ROLE.GUEST); // гость только читает
  await loadItems();
};

onSubmit('loginForm', async () => {
  const data = await request('POST', '/api/auth/login', {
    json: { email: $('loginEmail').value, password: $('loginPassword').value },
    auth: false
  });
  Object.assign(state, { accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user });
  saveTokens();
  $('loginPassword').value = '';
  await enterApp();
});

onSubmit('registerForm', async () => {
  await request('POST', '/api/auth/register', {
    json: { email: $('regEmail').value, password: $('regPassword').value },
    auth: false
  });
  showAlert('Регистрация прошла успешно. Теперь войдите.');
  $('loginEmail').value = $('regEmail').value;
  $('regPassword').value = '';
  showAuthForm('loginForm');
});

onSubmit('forgotForm', async () => {
  const data = await request('POST', '/api/auth/forgot-password', {
    json: { email: $('forgotEmail').value },
    auth: false
  });
  showAlert(data.message);
  showAuthForm('loginForm');
});

const resetToken = new URLSearchParams(window.location.search).get('reset_token');

onSubmit('resetForm', async () => {
  const data = await request('POST', '/api/auth/reset-password', {
    json: { token: resetToken, password: $('resetPassword').value },
    auth: false
  });
  showAlert(data.message);
  $('resetPassword').value = '';
  window.history.replaceState({}, '', window.location.pathname);
  showAuthForm('loginForm');
});

$('logoutBtn').addEventListener('click', async () => {
  // Даже если сервер недоступен, локально всё равно выходим
  await request('POST', '/api/auth/logout', { json: { refreshToken: state.refreshToken }, auth: false }).catch(() => {});
  localLogout();
});

/* ---------- Записи (CRUD) ---------- */
// Админ меняет/удаляет всё, пользователь — только свои записи, гость — ничего (сервер проверяет то же самое)
const canModify = (item) =>
  state.user.role_id === ROLE.ADMIN || (state.user.role_id === ROLE.USER && item.owner_id === state.user.id);

const attachmentNode = (filePath) => {
  if (IMAGE_EXT.includes(filePath.split('.').pop().toLowerCase())) {
    const wrap = el('div', 'file-preview');
    const img = el('img');
    img.src = filePath;
    img.alt = 'Вложение';
    img.loading = 'lazy';
    wrap.append(img);
    return wrap;
  }
  const link = el('a', 'file-link', `📎 Скачать ${fileName(filePath)}`);
  link.href = filePath;
  link.download = '';
  return link;
};

const itemCard = (item) => card(
  [
    el('h3', null, item.title),
    el('p', null, item.description),
    ...(item.file_path ? [attachmentNode(item.file_path)] : []),
    el('p', 'meta', `Автор: ${item.owner_email || 'неизвестен'}`)
  ],
  canModify(item)
    ? [button('Изменить', 'btn-secondary', () => editItem(item)), button('Удалить', 'btn-danger', () => deleteItem(item))]
    : []
);

const loadItems = async () => {
  try {
    state.items = await request('GET', '/api/items');
    renderList('itemsContainer', state.items.map(itemCard), 'Записей пока нет');
  } catch (err) {
    showError(err);
  }
};

onSubmit('itemForm', async () => {
  const formData = new FormData();
  formData.append('title', $('title').value);
  formData.append('description', $('description').value);
  if ($('file').files[0]) formData.append('file', $('file').files[0]);
  if ($('removeFileCheckbox').checked) formData.append('removeFile', 'true');

  const id = $('itemId').value;
  await request(id ? 'PUT' : 'POST', id ? `/api/items/${id}` : '/api/items', { formData });
  showAlert(id ? 'Запись обновлена' : 'Запись создана');
  resetItemForm();
  await loadItems();
});

const editItem = (item) => {
  $('itemId').value = item.id;
  $('title').value = item.title;
  $('description').value = item.description;
  $('file').value = '';
  $('removeFileCheckbox').checked = false;
  $('formTitle').textContent = 'Редактирование записи';
  $('cancelBtn').classList.remove('hidden');
  $('currentFileContainer').classList.toggle('hidden', !item.file_path);
  if (item.file_path) $('currentFileName').textContent = fileName(item.file_path);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const deleteItem = async (item) => {
  if (!confirm(`Удалить запись «${item.title}»?`)) return;
  try {
    await request('DELETE', `/api/items/${item.id}`);
    showAlert('Запись удалена');
    if ($('itemId').value === String(item.id)) resetItemForm();
    await loadItems();
  } catch (err) {
    showError(err);
  }
};

const resetItemForm = () => {
  $('itemForm').reset();
  $('itemId').value = '';
  $('currentFileContainer').classList.add('hidden');
  $('formTitle').textContent = 'Новая запись';
  $('cancelBtn').classList.add('hidden');
};

$('cancelBtn').addEventListener('click', resetItemForm);

/* ---------- Активные подключения ---------- */
const revokeSession = async (session) => {
  try {
    await request('DELETE', `/api/auth/sessions/${session.id}`);
    showAlert('Сессия завершена');
    if (session.current) return localLogout();
    await loadSessions();
  } catch (err) {
    showError(err);
  }
};

const sessionCard = (s) => {
  const title = el('h3', null, `Сессия #${s.id}`);
  if (s.current) title.append(el('span', 'badge badge-current', 'текущая'));
  return card(
    [
      title,
      el('p', null, s.user_agent || 'Неизвестное устройство'),
      el('p', 'meta', `IP: ${s.ip_address || '—'} · вход: ${formatDate(s.created_at)} · активность: ${formatDate(s.last_used_at)}`)
    ],
    [button('Завершить', 'btn-danger', () => revokeSession(s))]
  );
};

const loadSessions = async () => {
  try {
    const sessions = await request('GET', '/api/auth/sessions');
    renderList('sessionsContainer', sessions.map(sessionCard), 'Нет активных подключений');
  } catch (err) {
    showError(err);
  }
};

/* ---------- Пользователи и роли (админ) ---------- */
const roleSelect = (user) => {
  const select = el('select', 'role-select');
  select.setAttribute('aria-label', `Роль ${user.email}`);
  for (const [value, label] of Object.entries(ROLE_NAMES)) {
    const option = el('option', null, label);
    option.value = value;
    option.selected = Number(value) === user.role_id;
    select.append(option);
  }
  select.disabled = user.id === state.user.id; // собственную роль менять нельзя
  select.addEventListener('change', async () => {
    try {
      await request('PATCH', `/api/users/${user.id}/role`, { json: { role_id: Number(select.value) } });
      showAlert(`Роль ${user.email}: ${ROLE_NAMES[select.value]}`);
    } catch (err) {
      showError(err);
      await loadUsers();
    }
  });
  return select;
};

const userCard = (u) => {
  const title = el('h3', null, u.email);
  if (u.id === state.user.id) title.append(el('span', 'badge', 'вы'));
  return card([title, el('p', 'meta', `Регистрация: ${formatDate(u.created_at)}`)], [roleSelect(u)]);
};

const loadUsers = async () => {
  try {
    const users = await request('GET', '/api/users');
    renderList('usersContainer', users.map(userCard), 'Пользователей нет');
  } catch (err) {
    showError(err);
  }
};

/* ---------- Навигация ---------- */
$('sessionsBtn').addEventListener('click', () => { showView('sessions'); loadSessions(); });
$('usersBtn').addEventListener('click', () => { showView('users'); loadUsers(); });
$('backFromSessions').addEventListener('click', () => showView('app'));
$('backFromUsers').addEventListener('click', () => showView('app'));

/* ---------- Старт ---------- */
const init = async () => {
  if (resetToken) {
    showView('auth');
    return showAuthForm('resetForm');
  }
  if (!state.refreshToken) return localLogout();

  try {
    state.user = (await request('GET', '/api/auth/me')).user;
    await enterApp();
  } catch {
    localLogout();
  }
};

init();
