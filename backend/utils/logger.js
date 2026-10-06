// Структурированный логгер: одна строка = один JSON-объект.
// Пример: {"time":"2026-10-04T12:00:00.000Z","level":"info","msg":"Пользователь вошёл","userId":1}
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const currentLevel = () => LEVELS[process.env.LOG_LEVEL] || LEVELS.info;

const write = (level, msg, fields = {}) => {
  if (LEVELS[level] < currentLevel()) return;

  const entry = { time: new Date().toISOString(), level, msg };
  for (const [key, value] of Object.entries(fields)) {
    entry[key] = value instanceof Error
      ? { name: value.name, message: value.message, stack: value.stack }
      : value;
  }

  const line = JSON.stringify(entry);
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
};

module.exports = {
  debug: (msg, fields) => write('debug', msg, fields),
  info: (msg, fields) => write('info', msg, fields),
  warn: (msg, fields) => write('warn', msg, fields),
  error: (msg, fields) => write('error', msg, fields)
};
