/* ============================================================
   POST /api/verdict — 심사 결과를 사건에 붙인다. 재심이면 한 줄 더 쌓인다.
   링크(코드)를 아는 사람이 곧 권한이다. 지금 URL 토큰 방식과 같은 규칙이다.
   ============================================================ */
import { insert, CODE_RE, json, readBody, str, num, guard } from './_db.mjs';
import { fetchCase, shape } from './case.mjs';

export default guard(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { ok: false, reason: 'method' });

  const b = await readBody(req);
  const code = str(b.c, 8);
  if (!CODE_RE.test(code)) return json(res, 400, { ok: false, reason: 'bad-code' });

  const row = await fetchCase(code);
  if (!row) return json(res, 404, { ok: false, reason: 'gone' });

  await insert('verdicts', {
    case_id: code,
    score:   num(b.s, 0, 100, 0),
    bow:     num(b.b, 0, 100, 0),
    dict:    num(b.t, 0, 100, 0),
    cat:     num(b.cc, 0, 100, 0),
    penalty: num(b.p, 0, 100, 0),
    grade:   str(b.grade, 2) || 'F'
  });

  const fresh = await fetchCase(code);
  json(res, 200, shape(fresh, null));
});
