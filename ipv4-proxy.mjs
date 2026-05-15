import http from 'http';
import { URL } from 'url';

const TARGET_PORT = 3001;
const TARGET_HOST = '127.0.0.1';
const PROXY_PORT = 3000;

const server = http.createServer((req, res) => {
  const options = {
    hostname: TARGET_HOST,
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };
  
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  
  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502);
      res.end('Bad Gateway');
    }
  });
  
  req.pipe(proxyReq, { end: true });
});

// Handle WebSocket upgrade requests
server.on('upgrade', (req, socket, head) => {
  const options = {
    hostname: TARGET_HOST,
    port: TARGET_PORT,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };
  
  const proxyReq = http.request(options);
  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    proxySocket.on('error', (err) => {
      console.error('Proxy socket error:', err.message);
      socket.destroy();
    });
    socket.on('error', (err) => {
      console.error('Client socket error:', err.message);
      proxySocket.destroy();
    });
    if (!socket.destroyed && !proxySocket.destroyed) {
      socket.write(`HTTP/${req.httpVersion} 101 Switching Protocols\r\n`);
      for (const [key, value] of Object.entries(proxyRes.headers)) {
        socket.write(`${key}: ${value}\r\n`);
      }
      socket.write('\r\n');
      proxySocket.write(proxyHead);
      proxySocket.pipe(socket).pipe(proxySocket);
    }
  });
  proxyReq.on('error', (err) => {
    console.error('Proxy upgrade error:', err.message);
    socket.destroy();
  });
  proxyReq.end();
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`IPv4 Proxy listening on port ${PROXY_PORT}, forwarding to ${TARGET_HOST}:${TARGET_PORT}`);
});
