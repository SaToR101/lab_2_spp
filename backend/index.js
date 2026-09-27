const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://user:password@db:5432/appdb'
});

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Принимаем абсолютно любые файлы
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safeName = Date.now() + '-' + Math.round(Math.random() * 1E9) + ext;
    cb(null, safeName);
  }
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadDir));

const initDb = async (retries = 5) => {
  while (retries) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS items (
          id SERIAL PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          description TEXT NOT NULL,
          file_path VARCHAR(255)
        );
      `);
      console.log('БД готова к работе');
      break;
    } catch (err) {
      retries -= 1;
      await new Promise(res => setTimeout(res, 3000));
    }
  }
};
initDb();

app.get('/api/items', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM items ORDER BY id DESC');
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка БД' });
  }
});

app.post('/api/items', upload.single('file'), async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title || !description) return res.status(400).json({ error: 'Заполните поля' });

    const filePath = req.file ? `/uploads/${req.file.filename}` : null;
    const result = await pool.query(
      'INSERT INTO items (title, description, file_path) VALUES ($1, $2, $3) RETURNING *',
      [title, description, filePath]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

app.put('/api/items/:id', upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, removeFile } = req.body;
    if (!title || !description) return res.status(400).json({ error: 'Заполните поля' });

    const existing = await pool.query('SELECT * FROM items WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Не найдено' });

    let filePath = existing.rows[0].file_path;

    // 1. Если стоит галочка "Удалить файл"
    if (removeFile === 'true') {
      filePath = null;
    } 
    // 2. Если загрузили новый файл взамен старого
    else if (req.file) {
      filePath = `/uploads/${req.file.filename}`;
    }

    const result = await pool.query(
      'UPDATE items SET title = $1, description = $2, file_path = $3 WHERE id = $4 RETURNING *',
      [title, description, filePath, id]
    );
    res.status(200).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

app.delete('/api/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM items WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Не найдено' });
    res.status(200).json({ message: 'Удалено' });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

app.listen(PORT, () => console.log(`Server on port ${PORT}`));