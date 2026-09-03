/* ============================================================
   GET /api/casefile — 이 기기의 사건철. 로그인은 없다.
   기기가 들고 있는 키의 해시로만 부른다. 키를 잃으면 사건철도 잃는다.
   ============================================================ */
import { rest, keeperOf, json, guard } from './_db.mjs';
import { shape } from './case.mjs';

export default guard(async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { ok: false, reason: 'method' });

  const keeper = keeperOf(req);
  if (!keeper) return json(res, 200, { ok: true, cases: [] });

  const rows = await rest(
    `cases?keeper=eq.${keeper}&expires_at=gt.now` +
    `&select=*,verdicts(*,settlements(*))&order=created_at.desc&limit=100`
  );

  json(res, 200, { ok: true, cases: (rows || []).map((r) => shape(r, keeper)) });
});
