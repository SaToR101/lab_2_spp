const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const config = require('../config');
const AppError = require('../utils/AppError');

const uploadDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.txt', '.doc', '.docx'];

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: config.maxFileSize, files: 1 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_EXT.includes(path.extname(file.originalname).toLowerCase())) return cb(null, true);
    cb(AppError.unsupportedMediaType(`Недопустимый тип файла. Разрешены: ${ALLOWED_EXT.join(', ')}`));
  }
});

// Публичный путь загруженного файла (или null, если файла нет)
const uploadedPath = (file) => (file ? `/uploads/${file.filename}` : null);

// Удаляет файл по пути вида /uploads/xxx.png (без выхода за пределы папки uploads)
const removeUpload = async (filePath) => {
  if (!filePath?.startsWith('/uploads/')) return;
  await fs.promises.rm(path.join(uploadDir, path.basename(filePath)), { force: true });
};

module.exports = { upload, uploadDir, uploadedPath, removeUpload };
