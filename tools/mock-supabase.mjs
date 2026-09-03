/* ============================================================
   mock-supabase.mjs — PostgREST 중 이 앱이 실제로 쓰는 부분만 흉내낸다.
   Supabase 프로젝트 없이 흐름을 끝까지 돌려보기 위한 것이다.
   메모리에만 있고, 프로세스가 죽으면 같이 사라진다. 운영과 무관하다.
   ============================================================ */
import { createServer } from 'node:http';

const db = { cases: [], verdicts: [], settlements: [] };
let seq = 1;

const now = () => new Date().toISOString();

/** id=eq.x, keeper=eq.x, expires_at=gt.now 만 해석한다. */
function match(row, params) {
  for (const [key, raw] of params) {
    if (key === 'select' || key === 'order' || key === 'limit') continue;
    const [op, ...rest] = raw.split('.');
    const val = rest.join('.');
    const cell = row[key];
    if (op === 'eq' && String(cell) !== val) return false;
    if (op === 'gt') {
      const rhs = val === 'now' ? now() : val;
      if (!(String(cell) > rhs)) return false;
    }
  }
  return true;
}

function embed(kase) {
  const verdicts = db.verdicts
    .filter((v) => v.case_id === kase.id)
    .map((v) => ({ ...v, settlements: db.settlements.filter((s) => s.verdict_id === v.id) }));
  return { ...kase, verdicts };
}

const send = (res, code, body) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(body === undefined ? '' : JSON.stringify(body));
};

const readJson = (req) => new Promise((resolve) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
});

export function start(port = 0) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const table = url.pathname.replace('/rest/v1/', '');
    const params = [...url.searchParams.entries()];
    if (!db[table]) return send(res, 404, { message: 'no table ' + table });

    if (req.method === 'GET') {
      let rows = db[table].filter((r) => match(r, params));
      if (table === 'cases') rows = rows.map(embed);
      const order = url.searchParams.get('order');
      if (order && order.endsWith('.desc')) {
        const col = order.split('.')[0];
        rows.sort((a, b) => String(b[col]).localeCompare(String(a[col])));
      }
      const limit = +url.searchParams.get('limit');
      return send(res, 200, limit ? rows.slice(0, limit) : rows);
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      if (table !== 'cases' && !('id' in body)) body.id = seq++;
      if (table === 'cases' && db.cases.some((c) => c.id === body.id)) {
        return send(res, 409, { message: 'duplicate key' });
      }
      const row = {
        created_at: now(),
        ...(table === 'cases'
          ? { expires_at: new Date(Date.now() + 90 * 864e5).toISOString(), from_name: null, terms: [] }
          : {}),
        ...(table === 'settlements' ? { sealed_at: now(), voided_at: null, void_reason: null } : {}),
        ...body
      };
      db[table].push(row);
      return send(res, 201, [row]);
    }

    if (req.method === 'PATCH') {
      const body = await readJson(req);
      const hit = db[table].filter((r) => match(r, params));
      hit.forEach((r) => Object.assign(r, body));
      return send(res, 200, hit);
    }

    send(res, 405, { message: 'method' });
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port, db }));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { port } = await start(+(process.argv[2] || 8932));
  console.log('mock supabase → http://127.0.0.1:' + port + '/rest/v1');
}
