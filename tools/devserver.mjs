/* ============================================================
   devserver.mjs — 정적 파일 + /api 핸들러를 한 포트에서 돌린다.
   Vercel 이 하는 일을 아주 얇게 흉내낸 것. 개발/검증용이다.

     node tools/devserver.mjs 8931            # DB 없이 (URL 토큰 방식으로 폴백)
     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node tools/devserver.mjs 8931
   ============================================================ */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon'
};

export function start(port = 8931) {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname;

    if (path.startsWith('/api/')) {
      const name = path.slice(5).replace(/[^a-z]/g, '');
      try {
        const mod = await import(new URL(`../api/${name}.mjs`, import.meta.url).href);
        return void await mod.default(req, res);
      } catch (e) {
        res.statusCode = e.code === 'ERR_MODULE_NOT_FOUND' ? 404 : 500;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ ok: false, reason: e.message }));
      }
    }

    const file = normalize(join(ROOT, path === '/' ? 'index.html' : path));
    if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end('nope'); }
    try {
      const body = await readFile(file);
      res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');   // 옛 JS 를 물고 있지 않게
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end('not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { port } = await start(+(process.argv[2] || 8931));
  console.log(`http://127.0.0.1:${port}  (db: ${process.env.SUPABASE_URL ? 'on' : 'off'})`);
}
