/* ============================================================
   POST /api/void — "동일 사건이 재발할 경우 즉시 효력을 잃습니다."
   수리증에 적힌 단서 조항을 실제로 집행하는 곳. 사건철 주인만 누를 수 있다.
   ============================================================ */
import { patch, CODE_RE, keeperOf, json, readBody, str, guard } from './_db.mjs';
import { fetchCase, shape } from './case.mjs';

export default guard(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { ok: false, reason: 'method' });

  const keeper = keeperOf(req);
  const b = await readBody(req);
  const code = str(b.c, 8);
  if (!CODE_RE.test(code)) return json(res, 400, { ok: false, reason: 'bad-code' });

  const row = await fetchCase(code);
  if (!row) return json(res, 404, { ok: false, reason: 'gone' });
  if (!keeper || keeper !== row.keeper) return json(res, 403, { ok: false, reason: 'not-yours' });

  // 지금 유효한 수리증 하나만 본다. 재심을 다시 했다면 옛 도장은 이미 현재 상태가 아니다.
  const verdicts = (row.verdicts || []).slice().sort((x, y) => Date.parse(x.created_at) - Date.parse(y.created_at));
  const last = verdicts[verdicts.length - 1];
  const seal = last && (last.settlements || [])[0];
  if (!seal) return json(res, 409, { ok: false, reason: 'nothing-to-void' });
  if (seal.voided_at) return json(res, 200, shape(row, keeper));

  await patch('settlements', 'id=eq.' + seal.id, {
    voided_at: new Date().toISOString(),
    void_reason: str(b.reason, 120) || null
  });

  const fresh = await fetchCase(code);
  json(res, 200, shape(fresh, keeper));
});
