const { createServer } = require('node:http');
const path = require('node:path');
const { startDevServer } = require('@web/dev-server');
const { FIXTURE_BASE_URL } = require('../libs/constants.cjs');

async function start() {
  const { hostname, port } = new URL(FIXTURE_BASE_URL);
  const devServer = await startDevServer({
    config: {
      rootDir: path.resolve(__dirname, '../..'),
      middlewareMode: true,
    },
    readCliArgs: false,
    readFileConfig: false,
    autoExitProcess: false,
    logStartMessage: false,
  });
  // Web Dev Server's normal listener treats loopback hostnames as all interfaces.
  const server = createServer(devServer.koaApp.callback());
  server.on('error', (error) => {
    console.error(error);
    process.exit(1);
  });
  server.listen(Number(port), hostname);

  async function stop() {
    server.closeAllConnections();
    server.close();
    await devServer.stop();
  }
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
