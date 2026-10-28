// SEOUL CHICK — Local Development HTTP Server (Node.js Built-in)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
  let reqUrl = decodeURI(req.url.split('?')[0]);
  if (reqUrl === '/' || reqUrl === '') reqUrl = '/index.html';

  let filePath = path.join(ROOT, reqUrl);

  // Security: prevent path traversal outside root
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback for SPA routing if needed
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>404 Not Found</h1><p>Fayl topilmadi: ${reqUrl}</p><p><a href="/">Bosh sahifaga qaytish</a></p>`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 SEOUL CHICK SERVER IS RUNNING!`);
  console.log(`📍 Web App (Mijozlar uchun):  http://localhost:${PORT}`);
  console.log(`🔐 Admin Panel:              http://localhost:${PORT}/admin.html`);
  console.log(`🔑 Admin PIN kodi:           0997`);
  console.log(`====================================================`);
});
