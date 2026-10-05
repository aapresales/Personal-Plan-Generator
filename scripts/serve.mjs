/**
 * 零依赖静态服务器（本地预览用）。
 *   npm run serve   →  http://127.0.0.1:5173
 *
 * 说明：页面通过 fetch 读取 data/*.json，直接用 file:// 打开会被浏览器
 * CORS 策略拦住，所以本地跑请用这个脚本（线上 GitHub Pages 不受影响）。
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = join(root, normalize(path).replace(/^([/\\])+/, ''));
    if (!file.startsWith(root)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const info = await stat(file);
    if (info.isDirectory()) {
      res.writeHead(302, { Location: path + '/' }).end();
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`LED 方案规划器 → http://127.0.0.1:${PORT}/`);
});
