/* 서버가 살아 있고 DB 가 붙어 있는지. 클라이언트는 이걸 보고 링크 방식을 고른다. */
import { configured, json } from './_db.mjs';

export default function handler(req, res) {
  json(res, 200, { ok: true, db: configured() });
}
