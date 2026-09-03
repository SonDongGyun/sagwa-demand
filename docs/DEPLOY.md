# 배포 — 서버 붙이기

이 앱은 **서버 없이도 전부 동작합니다.** 아래 절차는 짧은 링크 · 내 사건철 ·
재발 신고(수리증 효력 상실) 세 가지를 켜기 위한 것입니다.
환경변수를 안 넣으면 `/api/*` 가 501 을 돌려주고 앱은 조용히 URL 토큰 모드로 굴러갑니다.

전부 무료 구간 안에서 됩니다. 걸리는 시간 10분 남짓.

---

## 1. Supabase 프로젝트 만들기

[supabase.com/dashboard](https://supabase.com/dashboard) → **New project**

| 항목 | 값 |
|---|---|
| Name | `sagwa-demand` (아무거나) |
| Database Password | 아무거나. **이 앱에서는 안 씁니다** (PostgREST 만 쓰므로) |
| Region | `Northeast Asia (Seoul)` |
| Plan | Free |

프로비저닝에 1–2분 걸립니다.

## 2. 테이블 만들기

대시보드 왼쪽 **SQL Editor** → **New query** → [`docs/schema.sql`](schema.sql) 전체를
붙여넣고 **Run**.

`Success. No rows returned` 이 나오면 된 겁니다.
**Table Editor** 에 `cases` · `verdicts` · `settlements` 세 개가 보이고,
각각 옆에 초록색 `RLS enabled` 배지가 붙어 있어야 합니다.

> **정책(Policy)은 하나도 만들지 마세요.** 일부러 그런 겁니다.
> 브라우저는 Supabase 를 직접 부르지 않고, 서버 라우트만 `service_role` 로 붙습니다.
> RLS 를 켠 채 정책이 없으면 그 외 경로는 전부 막힙니다.

**만료 청소(선택)** — **Database → Extensions** 에서 `pg_cron` 을 켠 뒤,
`schema.sql` 맨 아래 주석 처리된 `cron.schedule(...)` 한 줄을 실행하면
매일 새벽 4시에 90일 지난 사건이 지워집니다. 안 켜도 조회할 때 `expires_at` 으로
한 번 더 거르므로 만료된 사건은 열리지 않습니다.

## 3. 키 두 개 챙기기

대시보드 **Project Settings → API**

| 화면에 표시된 이름 | 넣을 환경변수 |
|---|---|
| Project URL (`https://xxxx.supabase.co`) | `SUPABASE_URL` |
| Project API keys → **`service_role`** (`secret` 라고 적힌 것) | `SUPABASE_SERVICE_ROLE_KEY` |

> `anon` `public` 키가 **아닙니다.** `service_role` 키는 RLS 를 우회하므로
> 절대 브라우저로 내려가면 안 됩니다. 이 앱에서는 서버 라우트만 읽으니 안전합니다.
> 커밋하지 마세요. 실수로 노출됐으면 같은 화면에서 로테이트할 수 있습니다.

## 4. Vercel 에 넣기

**대시보드에서** — 프로젝트 → **Settings → Environment Variables** →
위 두 개를 `Production` · `Preview` · `Development` 전부 체크해서 추가.

**CLI 로 한다면**

```bash
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

## 5. 배포 (그리고 반드시 재배포)

```bash
vercel --prod
```

> **환경변수를 나중에 넣었으면 재배포해야 합니다.** `api/_db.mjs` 는 모듈 로드 시점,
> 즉 콜드 스타트에 한 번만 env 를 읽습니다. 변수를 추가하는 것만으로는
> 이미 떠 있는 함수에 반영되지 않습니다.

빌드 설정은 건드릴 게 없습니다 — `package.json` 이 없으므로 Vercel 이
정적 사이트로 잡고, `api/*.mjs` 는 자동으로 Node 서버리스 함수가 됩니다.
`api/_db.mjs` 는 `_` 로 시작하니 라우트가 되지 않습니다.

## 6. 확인

```bash
curl https://<your-app>.vercel.app/api/health
```

| 응답 | 뜻 |
|---|---|
| `{"ok":true,"db":true}` | 다 됐습니다 |
| `{"ok":true,"db":false}` | env 가 함수에 안 들어갔습니다 → 5번(재배포) |
| `404` | `api/` 가 배포에 안 올라갔습니다 → 커밋했는지 확인 |

브라우저에서도 한 번 봅니다.

1. 요구서를 하나 발부합니다. 링크가 `?d=ba4ptww9` 처럼 **짧게** 나오고
   `사건번호 ... 로 접수했습니다` 안내가 뜨면 서버가 붙은 겁니다.
2. 작성 화면 아래 `내 사건철 열기` 버튼이 나타나고, 방금 건이 `심사 대기` 로 들어 있어야 합니다.
   (이 버튼은 서버가 붙어 있고 발부한 건이 있을 때만 보입니다.)
3. 심사를 통과시키고 도장까지 찍은 뒤, 사건철에서 `이 사건이 또 일어났습니다` 를
   누르고 `수리증 효력 상실` 로 확정합니다. 수리증에 붉은 띠가 찍히면 끝입니다.

---

## 로컬에서 미리 보기

Supabase 없이 서버 모드를 그대로 볼 수 있습니다.

```bash
node tools/devserver.mjs 8931
```

`tools/mock-supabase.mjs` 가 PostgREST 를 필요한 만큼만 흉내 냅니다.
데이터는 프로세스 메모리 안에만 있고 끄면 사라집니다.
진짜 Supabase 로 붙이고 싶으면 환경변수를 주면 됩니다.

```bash
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
node tools/devserver.mjs 8931
```

## 안 붙이기로 한다면

아무것도 안 하면 됩니다. GitHub Pages 든 어디든 정적으로 올리면
요구서 · 심사 · 판정 · 도장 · 수리증까지 전부 동작합니다.
링크가 길어지고, 사건철과 재발 신고가 없을 뿐입니다.

## 무엇이 저장되나

| 저장됨 | 저장 안 됨 |
|---|---|
| 이름 두 개, 사건의 요지, 분노 게이지, 요구 조건 | 이메일 · 전화번호 · 계정 |
| 심사 점수와 등급, 수리 시각, 덧붙인 한마디 | 사건철 키 원본 (sha256 만) |
| 사건번호 8자 | IP · 쿠키 · 접속 기록 |

전부 90일 뒤 지워집니다. 남의 험담을 영구 보관할 이유가 없습니다.
