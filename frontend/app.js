const API_URL = '/api/items';

const itemForm = document.getElementById('itemForm');
const titleInput = document.getElementById('title');
const descInput = document.getElementById('description');
const fileInput = document.getElementById('file');
const itemIdInput = document.getElementById('itemId');
const formTitle = document.getElementById('formTitle');
const cancelBtn = document.getElementById('cancelBtn');
const itemsContainer = document.getElementById('itemsContainer');
const alertBox = document.getElementById('alert');

const currentFileContainer = document.getElementById('currentFileContainer');
const currentFileName = document.getElementById('currentFileName');
const removeFileCheckbox = document.getElementById('removeFileCheckbox');

const showAlert = (msg, isError = false) => {
  alertBox.textContent = msg;
  alertBox.className = `alert ${isError ? 'error' : 'success'}`;
  setTimeout(() => alertBox.className = 'alert hidden', 4000);
};

const handleResponse = async (res) => {
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка сервера');
    return data;
  } else {
    throw new Error(`Ошибка сервера (${res.status}): ${res.statusText}`);
  }
};

const fetchItems = async () => {
  try {
    const res = await fetch(API_URL);
    const data = await handleResponse(res);
    renderItems(data);
  } catch (err) {
    showAlert(err.message, true);
  }
};

const isImageFile = (filePath) => {
  if (!filePath) return false;
  const ext = filePath.split('.').pop().toLowerCase();
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
};

const renderItems = (items) => {
  itemsContainer.innerHTML = '';
  if (!items || items.length === 0) {
    itemsContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">Нет сохраненных записей</p>';
    return;
  }

  items.forEach(item => {
    const div = document.createElement('div');
    div.className = 'item-card';

    let fileContent = '';
    if (item.file_path) {
      if (isImageFile(item.file_path)) {
        fileContent = `<div class="file-preview"><img src="${item.file_path}" alt="attachment"></div>`;
      } else {
        const fileName = item.file_path.split('/').pop();
        fileContent = `<div class="file-link"><a href="${item.file_path}" target="_blank" download>📎 Скачать ${fileName}</a></div>`;
      }
    }

    div.innerHTML = `
      <div class="item-info">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.description)}</p>
        ${fileContent}
      </div>
      <div class="item-actions">
        <button class="btn btn-edit" onclick="editItem(${item.id}, '${escapeJs(item.title)}', '${escapeJs(item.description)}', '${escapeJs(item.file_path || '')}')">Изменить</button>
        <button class="btn btn-danger" onclick="deleteItem(${item.id})">Удалить</button>
      </div>
    `;
    itemsContainer.appendChild(div);
  });
};

const escapeHtml = (str) => {
  return str ? str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : '';
};

const escapeJs = (str) => {
  return str ? str.replace(/'/g, "\\'").replace(/\n/g, " ") : '';
};

itemForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData();
  formData.append('title', titleInput.value);
  formData.append('description', descInput.value);
  
  if (fileInput.files[0]) {
    formData.append('file', fileInput.files[0]);
  }

  if (removeFileCheckbox && removeFileCheckbox.checked) {
    formData.append('removeFile', 'true');
  }

  const id = itemIdInput.value;
  const method = id ? 'PUT' : 'POST';
  const url = id ? `${API_URL}/${id}` : API_URL;

  try {
    const res = await fetch(url, { method, body: formData });
    await handleResponse(res);

    showAlert(id ? 'Запись успешно обновлена!' : 'Запись успешно создана!');
    resetForm();
    fetchItems();
  } catch (err) {
    showAlert(err.message, true);
  }
});

window.editItem = (id, title, description, filePath) => {
  itemIdInput.value = id;
  titleInput.value = title;
  descInput.value = description;
  formTitle.textContent = 'Редактировать запись';
  cancelBtn.classList.remove('hidden');

  if (filePath && currentFileContainer) {
    const fileName = filePath.split('/').pop();
    currentFileName.textContent = fileName;
    currentFileContainer.classList.remove('hidden');
  } else if (currentFileContainer) {
    currentFileContainer.classList.add('hidden');
  }
  if (removeFileCheckbox) removeFileCheckbox.checked = false;
};

window.deleteItem = async (id) => {
  if (!confirm('Вы уверены, что хотите удалить элемент?')) return;
  try {
    const res = await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
    await handleResponse(res);
    showAlert('Удалено!');
    fetchItems();
  } catch (err) {
    showAlert(err.message, true);
  }
};

const resetForm = () => {
  itemIdInput.value = '';
  titleInput.value = '';
  descInput.value = '';
  fileInput.value = '';
  if (removeFileCheckbox) removeFileCheckbox.checked = false;
  if (currentFileContainer) currentFileContainer.classList.add('hidden');
  formTitle.textContent = 'Добавить элемент';
  cancelBtn.classList.add('hidden');
};

cancelBtn.addEventListener('click', resetForm);
fetchItems();