/* ============================================================
   _db.mjs — Supabase PostgREST 를 fetch 로 직접 친다.
   의존성을 0개로 두려고 supabase-js 를 쓰지 않는다.
   밑줄로 시작하는 파일은 Vercel 이 라우트로 잡지 않는다.
   ============================================================ */
import { createHash, randomBytes } from 'node:crypto';

const BASE = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** 환경변수가 없으면 서버는 스스로 꺼진다. 클라이언트는 URL 토큰으로 돌아간다. */
export const configured = () => !!(BASE && KEY);

export async function rest(path, init = {}) {
  const res = await fetch(BASE + '/rest/v1/' + path, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: 'Bearer ' + KEY,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const e = new Error('supabase ' + res.status);
    e.status = res.status;
    e.body = body;
    throw e;
  }
  return body;
}

export const insert = (table, row) =>
  rest(table, { method: 'POST', body: JSON.stringify(row), headers: { Prefer: 'return=representation' } });

export const patch = (table, query, row) =>
  rest(table + '?' + query, { method: 'PATCH', body: JSON.stringify(row), headers: { Prefer: 'return=representation' } });

/* ── 코드 ────────────────────────────────────────────── */

// 0/O/1/l 처럼 헷갈리는 글자를 뺐다. 손으로 옮겨 적을 수도 있으니까.
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
export const CODE_RE = /^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/;

export function newCode() {
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/* ── 사건철 키 ───────────────────────────────────────── */

/** 기기의 사건철 키는 해시만 저장한다. DB 가 새도 남의 사건철을 열 수는 없다. */
export const keeperHash = (raw) => createHash('sha256').update(String(raw)).digest('hex');

export function keeperOf(req) {
  const raw = req.headers['x-sagwa-keeper'];
  if (!raw || typeof raw !== 'string' || raw.length < 8 || raw.length > 200) return null;
  return keeperHash(raw);
}

/* ── 요청/응답 ───────────────────────────────────────── */

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

const MAX_BODY = 8 * 1024;

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;     // Vercel 이 이미 파싱한 경우
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('body too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('bad json'), { status: 400 }); }
}

/** 서버는 클라이언트를 믿지 않는다. 길이도 타입도 여기서 다시 자른다. */
export const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const num = (v, lo, hi, dflt) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
};

/** 핸들러를 감싸 설정 여부 확인과 에러 변환을 한곳에서 한다. */
export function guard(fn) {
  return async (req, res) => {
    if (!configured()) return json(res, 501, { ok: false, reason: 'not-configured' });
    try {
      await fn(req, res);
    } catch (e) {
      const status = e.status && e.status < 500 ? e.status : 500;
      if (status >= 500) console.error('[api]', e.message, e.body ?? '');
      json(res, status, { ok: false, reason: status === 500 ? 'server' : e.message });
    }
  };
}
