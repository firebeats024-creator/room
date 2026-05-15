const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logFd = fs.openSync(path.join(__dirname, 'dev.log'), 'w');

// Start Next.js
const nextProc = spawn('node', ['node_modules/.bin/next', 'dev', '-p', '3001'], {
  cwd: __dirname,
  detached: true,
  stdio: ['ignore', logFd, logFd]
});
nextProc.unref();

console.log(`Next.js PID: ${nextProc.pid}`);

// Wait then start proxy
setTimeout(() => {
  const proxyProc = spawn('node', ['ipv4-proxy.mjs'], {
    cwd: __dirname,
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore']
  });
  proxyProc.unref();
  console.log(`Proxy PID: ${proxyProc.pid}`);
}, 8000);
