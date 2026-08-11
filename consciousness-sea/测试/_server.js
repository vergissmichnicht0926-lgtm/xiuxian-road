const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve('C:/Users/v\'er\'g\'i\'s\'s\'mi\'ch\'t/Desktop/work/consciousness-sea/chapter-1');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.ogg':'audio/ogg', '.png':'image/png', '.mp3':'audio/mpeg', '.json':'application/json' };
http.createServer((req,res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p);
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(8734, () => console.log('server on 8734'));
