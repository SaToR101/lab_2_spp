const bcrypt = require('bcryptjs');
const pool = require('./db');
const config = require('./config');
const logger = require('./utils/logger');
const { ROLE } = require('./utils/permissions');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS roles (
    id   SMALLINT PRIMARY KEY,
    name VARCHAR(20) UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id               SERIAL PRIMARY KEY,
    email            VARCHAR(254) UNIQUE NOT NULL,
    password_hash    TEXT NOT NULL,
    role_id          SMALLINT NOT NULL DEFAULT 2 REFERENCES roles(id),
    failed_attempts  INT NOT NULL DEFAULT 0,
    locked_until     TIMESTAMPTZ,
    reset_token_hash VARCHAR(64),
    reset_expires    TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id           SERIAL PRIMARY KEY,
    user_id      INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   VARCHAR(64) UNIQUE NOT NULL,
    user_agent   TEXT,
    ip_address   VARCHAR(64),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS items (
    id          SERIAL PRIMARY KEY,
    title       VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    file_path   VARCHAR(255),
    owner_id    INT REFERENCES users(id) ON DELETE SET NULL
  );

  -- для баз, созданных прошлой версией (без владельца записи)
  ALTER TABLE items ADD COLUMN IF NOT EXISTS owner_id INT REFERENCES users(id) ON DELETE SET NULL;
`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Ждём, пока PostgreSQL начнёт принимать подключения
const waitForDb = async (attempts = 30) => {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      logger.warn('БД ещё не готова, повторная попытка', { attempt: i, reason: err.message });
      await sleep(2000);
    }
  }
  throw new Error('Не удалось подключиться к базе данных');
};

const initDb = async () => {
  await waitForDb();
  await pool.query(SCHEMA);

  // Справочник ролей (см. ROLE в utils/permissions)
  await pool.query(
    `INSERT INTO roles (id, name) VALUES ($1, 'guest'), ($2, 'user'), ($3, 'admin') ON CONFLICT (id) DO NOTHING`,
    [ROLE.GUEST, ROLE.USER, ROLE.ADMIN]
  );

  const adminEmail = config.adminEmail.toLowerCase();
  const hash = await bcrypt.hash(config.adminPassword, 10);
  const { rowCount } = await pool.query(
    'INSERT INTO users (email, password_hash, role_id) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING',
    [adminEmail, hash, ROLE.ADMIN]
  );
  if (rowCount) logger.info('Создан администратор по умолчанию', { email: adminEmail });

  logger.info('БД готова к работе');
};

module.exports = initDb;
