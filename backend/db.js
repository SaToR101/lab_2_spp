const { Pool } = require('pg');
const config = require('./config');

// Единственный пул подключений для всего приложения
const pool = new Pool({ connectionString: config.databaseUrl });

module.exports = pool;
