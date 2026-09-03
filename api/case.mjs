/* ============================================================
   /api/case
     GET  ?c=CODE  → 사건 + 최신 판정 + 수리 상태
     POST          → 사건 생성, 8자 코드 발급
   ============================================================ */
import { rest, insert, newCode, CODE_RE, keeperOf, json, readBody, str, num, guard } from './_db.mjs';

const ms = (t) => (t ? Date.parse(t) : null);

/** DB 행을 클라이언트가 아는 모양으로 편다. */
export function shape(row, keeper) {
  const verdicts = (row.verdicts || []).slice().sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const last = verdicts[verdicts.length - 1] || null;
  const seal = last && last.settlements && last.settlements[0] ? last.settlements[0] : null;

  return {
    ok: true,
    c: row.id,
    mine: !!keeper && keeper === row.keeper,
    to: row.to_name,
    from: row.from_name || '익명의 청구인',
    what: row.what,
    anger: row.anger,
    terms: row.terms || [],
    at: ms(row.created_at),
    tries: verdicts.length,
    verdict: last && {
      s: last.score, b: last.bow, t: last.dict, c: last.cat,
      p: last.penalty, grade: last.grade, at: ms(last.created_at)
    },
    settle: seal && {
      w: seal.word || '', aat: ms(seal.sealed_at),
      voided: ms(seal.voided_at), reason: seal.void_reason || ''
    }
  };
}

const SELECT = 'select=*,verdicts(*,settlements(*))';

export async function fetchCase(code) {
  const rows = await rest(`cases?id=eq.${encodeURIComponent(code)}&expires_at=gt.now&${SELECT}`);
  return rows && rows[0] ? rows[0] : null;
}

export default guard(async (req, res) => {
  const keeper = keeperOf(req);

  if (req.method === 'GET') {
    const code = String(new URL(req.url, 'http://x').searchParams.get('c') || '');
    if (!CODE_RE.test(code)) return json(res, 400, { ok: false, reason: 'bad-code' });
    const row = await fetchCase(code);
    if (!row) return json(res, 404, { ok: false, reason: 'gone' });
    return json(res, 200, shape(row, keeper));
  }

  if (req.method === 'POST') {
    if (!keeper) return json(res, 400, { ok: false, reason: 'no-keeper' });
    const b = await readBody(req);

    const to = str(b.to, 20);
    const what = str(b.what, 200);
    if (!to || !what) return json(res, 400, { ok: false, reason: 'missing' });

    const row = {
      keeper,
      to_name: to,
      from_name: str(b.from, 20) || null,
      what,
      anger: num(b.anger, 1, 10, 5),
      terms: Array.isArray(b.terms) ? b.terms.map((n) => num(n, 0, 31, 0)).slice(0, 12) : []
    };

    // 코드가 겹치면 다시 뽑는다. 31^8 이라 사실상 안 겹치지만 공짜다.
    for (let i = 0; i < 4; i++) {
      try {
        const [made] = await insert('cases', { ...row, id: newCode() });
        return json(res, 200, { ok: true, c: made.id });
      } catch (e) {
        if (e.status !== 409) throw e;
      }
    }
    return json(res, 503, { ok: false, reason: 'no-code' });
  }

  return json(res, 405, { ok: false, reason: 'method' });
});
