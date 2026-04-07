const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5500;
const PUBLIC_DIR = process.cwd();

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2'
  };
  return map[ext] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  // normalize url and prevent directory traversal
  let safePath = decodeURIComponent(req.url.split('?')[0]);
  if (safePath.includes('..')) {
    res.statusCode = 400;
    return res.end('Bad Request');
  }

  if (safePath === '/' || safePath === '') safePath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end('Not found');
    }

    if (stats.isDirectory()) {
      // try index.html inside directory
      const idx = path.join(filePath, 'index.html');
      return fs.readFile(idx, (ie, data) => {
        if (ie) {
          res.statusCode = 404;
          res.end('Not found');
        } else {
          res.setHeader('Content-Type', contentType('.html'));
          res.end(data);
        }
      });
    }

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) {
        res.statusCode = 500;
        res.end('Server error');
      } else {
        res.setHeader('Content-Type', contentType(filePath));
        res.end(data);
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
