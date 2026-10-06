const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

// SMTP-сервер, который принимает соединение, но молчит (как заблокированный/зависший SMTP)
const startSilentServer = () => new Promise((resolve) => {
  const sockets = new Set();
  const server = net.createServer((socket) => sockets.add(socket));
  server.listen(0, '127.0.0.1', () => resolve({
    port: server.address().port,
    close: () => { sockets.forEach((s) => s.destroy()); server.close(); }
  }));
});

test('sendResetEmail завершается ошибкой по таймауту, а не висит минутами', async () => {
  const server = await startSilentServer();
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = String(server.port);
  process.env.SMTP_TIMEOUT_MS = '300';
  const mailer = require('../utils/mailer');

  const silence = (stream) => { const w = stream.write; stream.write = () => true; return () => { stream.write = w; }; };
  const restore = silence(process.stderr);
  const started = Date.now();
  try {
    await assert.rejects(mailer.sendResetEmail('user@example.com', 'http://localhost/?reset_token=x'));
    assert.equal(await mailer.verify(), false);
  } finally {
    restore();
    server.close();
  }
  assert.ok(Date.now() - started < 5000, 'ошибка должна приходить в пределах таймаута');
});
