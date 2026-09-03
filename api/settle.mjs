/* ============================================================
   POST /api/settle — 도장을 찍는다. 사건당 최신 판정 하나에만 붙는다.
   ============================================================ */
import { insert, CODE_RE, json, readBody, str, guard } from './_db.mjs';
import { fetchCase, shape } from './case.mjs';

export default guard(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { ok: false, reason: 'method' });

  const b = await readBody(req);
  const code = str(b.c, 8);
  if (!CODE_RE.test(code)) return json(res, 400, { ok: false, reason: 'bad-code' });

  const row = await fetchCase(code);
  if (!row) return json(res, 404, { ok: false, reason: 'gone' });

  const verdicts = (row.verdicts || []).slice().sort((x, y) => Date.parse(x.created_at) - Date.parse(y.created_at));
  const last = verdicts[verdicts.length - 1];
  if (!last) return json(res, 409, { ok: false, reason: 'no-verdict' });
  if (last.settlements && last.settlements.length) {
    return json(res, 200, shape(row, null));            // 이미 찍혔다. 그대로 돌려준다
  }

  await insert('settlements', { verdict_id: last.id, word: str(b.w, 60) || null });

  const fresh = await fetchCase(code);
  json(res, 200, shape(fresh, null));
});
