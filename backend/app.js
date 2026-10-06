const express = require('express');
const cors = require('cors');
const pool = require('./db');
const requestLogger = require('./middleware/requestLogger');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { uploadDir } = require('./middleware/upload');
const AppError = require('./utils/AppError');
const authRoutes = require('./routes/authRoutes');
const itemRoutes = require('./routes/itemRoutes');
const userRoutes = require('./routes/userRoutes');

// Express 5 сам передаёт ошибки async-обработчиков в errorHandler — обёртки не нужны
const app = express();

// Приложение стоит за nginx: доверяем X-Forwarded-For, чтобы req.ip был реальным IP клиента
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(requestLogger);
app.use(cors());
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
  } catch {
    throw AppError.serviceUnavailable('База данных недоступна');
  }
  res.status(200).json({ status: 'ok' });
});

app.use('/uploads', express.static(uploadDir));
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/users', userRoutes);

app.use('/api', notFound);
app.use(errorHandler);

module.exports = app;
