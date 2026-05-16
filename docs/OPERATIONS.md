# 운영 가이드 — woodbank-app

신규 환경(서버·계정·운영자)에 처음 셋업하거나 마이그레이션할 때 참고하는 문서입니다. 빠른 사용법은 [README.md](../README.md) 를, 코드 작업 컨텍스트는 [CLAUDE.md](../CLAUDE.md) 를 보세요.

## 목차

1. [신규 Supabase 프로젝트 셋업](#1-신규-supabase-프로젝트-셋업)
2. [Vercel 배포 셋업](#2-vercel-배포-셋업)
3. [환경변수 레퍼런스](#3-환경변수-레퍼런스)
4. [사용자/역할 운영](#4-사용자역할-운영)
5. [마이그레이션 적용](#5-마이그레이션-적용)
6. [RLS 회귀 테스트(pgTAP)](#6-rls-회귀-테스트pgtap)
7. [백업·복구](#7-백업복구)
8. [장애 대응 체크리스트](#8-장애-대응-체크리스트)
9. [의존성 보안](#9-의존성-보안)

---

## 1. 신규 Supabase 프로젝트 셋업

1. <https://supabase.com> → **New Project** — Region은 `Northeast Asia (Seoul, ap-northeast-2)` 권장.
2. **SQL Editor**에서 마이그레이션을 **순서대로** 실행:
   - `supabase/migrations/001_schema.sql`
   - `supabase/migrations/002_rls.sql`
   - `supabase/migrations/003_storage_and_triggers.sql`
   - `supabase/migrations/004_seed.sql` (수종·행정구역 마스터·샘플 시드)
   - `supabase/migrations/005_admin_helpers.sql` (사용자 자동 생성 트리거 + admin RPC)
   - `supabase/migrations/006_dna_results.sql` (DNA 분석 결과 테이블 + dna Storage 버킷)
   - `supabase/migrations/007_specimens.sql` (시편 추적성 — disc/core/block/slide/tree-ring/fiber/extract/residue 다단계 계층 + create_specimen RPC)
   - `supabase/migrations/008_dna_to_specimens.sql` (DNA 분석 결과를 시편 단위로 이동 — `dna_results.specimen_id`)
   - `supabase/migrations/009_regions_full_seed.sql` (전국 시군구 마스터 시드 — 행안부 2024-05 기준 ~230건, 004 의 일부 오류도 함께 교정)
   - `supabase/migrations/010_normalize_sync_status.sql` (sync worker 가 단말의 `queued` 마킹을 그대로 서버에 보내던 버그로 화면에 `queued` 배지가 영구 표시되던 문제를 정정 — 기존 `sampling_events` 행을 모두 `synced` 로 일괄 update)
3. **Storage** → `photos` 버킷이 자동 생성되었는지 확인 (003에서 생성).
4. **Project Settings → API**:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (운영 환경변수에만)
5. **Authentication → URL Configuration**:
   - Site URL: `https://woodbank-app.vercel.app` (운영 도메인)
   - Redirect URLs 에 다음 모두 추가:
     - `https://woodbank-app.vercel.app/auth/callback` ✅ **매직링크·비밀번호 재설정 모두 이리로 옵니다**
     - `https://woodbank-app.vercel.app/auth/update-password` (구버전 호환)
     - 로컬 dev 테스트 시: `http://localhost:3000/auth/callback`
   - Redirect URL 미등록 시 매직링크 클릭이 `error=redirect_to_not_allowed` 로 실패합니다.
6. (선택) **Authentication → Email Templates** — 한국어로 갈아끼우려면 reset/invite/confirm 템플릿 수정.

> **CLI로 적용하기**: `supabase db push` 가 동작하면 더 깔끔. 단, 첫 셋업은 위의 SQL Editor 붙여넣기 방법으로 진행해도 동일하다.

### 첫 admin 부여

```sql
-- Authentication → Users 에서 본인 계정으로 가입한 뒤
insert into users_meta (id, display_name, role, organization, active)
values (
  (select id from auth.users where email = 'me@example.com'),
  '관리자',
  'admin',
  '서울대 목재연구실',
  true
)
on conflict (id) do update set role = 'admin', active = true;
```

## 2. Vercel 배포 셋업

1. GitHub repo → Vercel 프로젝트 연결.
2. **Environment Variables** — 표 [3장](#3-환경변수-레퍼런스) 참고. Production·Preview만 체크하고 Development는 비워두기(로컬 `.env.local` 사용).
3. **Settings → Domains** — 운영 도메인 연결.
4. **Database Webhook 등록** (선택, Resend 알림용):
   - Supabase Dashboard → Database → Webhooks → Create
   - Table: `auth.users`, Events: `Insert`만
   - URL: `https://<운영도메인>/api/webhooks/new-user`
   - HTTP Header: `X-Webhook-Secret: <WEBHOOK_SECRET 값>`
5. **Vercel Cron 활성화** (Supabase Free 일시중지 방지):
   - 이 repo 의 [vercel.json](../vercel.json) 에 매일 09:00 UTC(=KST 18:00) 1회 cron 정의되어 있음. Vercel 이 자동 인식.
   - **CRON_SECRET 환경변수 등록 필수** — `openssl rand -hex 32` 로 생성한 임의 문자열. Production·Preview 체크.
   - 셋업 후 Vercel Dashboard → 프로젝트 → **Cron Jobs** 탭에서 다음 실행 시각과 최근 결과 확인 가능. 첫 실행은 [Run Now] 로 즉시 검증.
   - 동작 원리: `/api/cron/keepalive` 가 Supabase PostgREST 에 가벼운 read 한 번 → 외부 API 활동 카운트가 만들어져 7일 일시중지 카운터가 reset. pg_cron 같은 DB 내부 작업은 게이트웨이를 안 거쳐 카운트 안 됨.
6. 첫 배포 후 `/admin` 페이지가 열리는지 확인.

> PWA 아이콘은 `public/icons/icon-192.png`, `public/icons/icon-512.png` 두 파일. 임시 단색 PNG라도 넣어야 모바일 홈화면 추가가 깨지지 않습니다.

## 3. 환경변수 레퍼런스

| 변수 | 위치 | 필수 | 설명 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 모든 환경 | ✅ | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 모든 환경 | ✅ | anon 키 (RLS 적용) |
| `SUPABASE_SERVICE_ROLE_KEY` | 운영(Prod/Preview) | 운영 필수 | RLS 우회. 클라이언트·Git 절대 노출 금지 |
| `RESEND_API_KEY` | 운영 | 선택 | 신규 가입 알림 메일. 미설정 시 admin 대시보드 노란 배너로 대체 |
| `ADMIN_NOTIFY_EMAILS` | 운영 | 선택 | 알림 수신 admin 이메일(쉼표 구분) |
| `RESEND_FROM_EMAIL` | 운영 | 선택 | 검증된 발신 도메인. 미설정 시 `onboarding@resend.dev` |
| `WEBHOOK_SECRET` | 운영 | 선택 | Supabase Webhook 검증용 32자 이상 임의 문자열 |
| `NEXT_PUBLIC_SITE_URL` | 운영 | 선택 | 이메일 redirect 도메인 기준 |
| `VWORLD_API_KEY` | 운영(서버) | 선택 | 좌표→주소 자동 채우기. 미설정 시 OSM Nominatim fallback |
| `CRON_SECRET` | 운영 | 선택 | Vercel Cron 의 `/api/cron/keepalive` 호출 검증용 32자 이상 임의 문자열. 미설정 시 라우트가 500 응답 → keepalive 동작 안 함. `openssl rand -hex 32` 로 생성 |

로컬은 `.env.local`(gitignore 됨). 예시는 [.env.example](../.env.example).

## 4. 사용자/역할 운영

- **신규 사용자 가입 시**: 트리거가 `users_meta`에 `role='guest'`로 자동 등록.
- **역할 부여**: `/admin/users` 화면에서 변경(admin RPC `admin_set_user_role` 사용) — 또는 SQL.
- **담당 지역 매핑**: `/admin/users` 우측 패널 또는 직접 SQL:

```sql
insert into user_region_assignments (user_id, sigungu_code, role)
values (
  (select id from auth.users where email = 'lead@example.com'),
  '46710',          -- 담양군
  'lead'            -- 또는 'surveyor'
);
```

- **외부 협력자 공유** — 특정 site만 read 접근 허용:

```sql
insert into collaborator_shares (user_id, site_id, granted_by, expires_at)
values (
  (select id from auth.users where email = 'collab@example.com'),
  '<site uuid>',
  auth.uid(),
  now() + interval '90 days'
);
```

- **사용자 비활성화**: `/admin/users`에서 토글(`admin_set_user_active`).

## 5. 마이그레이션 적용

새 SQL 파일은 `supabase/migrations/NNN_*.sql`로 추가하고, 다음 원칙을 지킵니다.

- 모두 **재실행 안전**(idempotent)하게: `create ... if not exists`, `drop policy if exists`, `do $$ ... when duplicate_object then null` 등.
- 트리거·함수는 `create or replace`.
- 적용 후 [pgTAP RLS 테스트](#6-rls-회귀-테스트pgtap) 통과 확인.

운영 적용 절차:

1. 로컬 또는 staging 프로젝트에서 먼저 검증.
2. Supabase Dashboard → SQL Editor에 붙여넣어 실행.
3. README 마이그레이션 목록을 갱신.

## 6. RLS 회귀 테스트(pgTAP)

pgTAP은 Postgres에 내장 가능한 단위 테스트 프레임워크. 외부 협력자가 다른 지역의 데이터를 못 보는지 등을 SQL로 검증합니다.

### 한 번만 셋업

```sql
-- Supabase SQL Editor에서 1회 실행
create extension if not exists pgtap with schema extensions;
```

### 테스트 실행

방법 A — Supabase SQL Editor에 [supabase/tests/rls/01_rls_smoke.sql](../supabase/tests/rls/01_rls_smoke.sql) 내용을 그대로 붙여 실행. 모든 케이스 `ok N - ...`로 출력되어야 합니다.

방법 B — `psql` 사용:

```bash
psql "$SUPABASE_DB_URL" -f supabase/tests/rls/01_rls_smoke.sql
```

### 새 정책 추가 시

- 새 케이스를 같은 파일 또는 `02_*`로 추가.
- 각 역할(`admin/lead/surveyor/collaborator/guest`)별 read·write 기대 결과를 모두 명시.
- CI에 붙이려면 Supabase CLI(`supabase test db`) 또는 자체 GitHub Action.

## 7. 백업·복구

- Supabase Pro 이상은 자동 일일 백업. Free 티어는 **수동 백업 권장**.
- 정기 백업: Supabase CLI

```bash
supabase db dump --linked --data-only > backups/data-$(date +%Y%m%d).sql
supabase db dump --linked --schema-only > backups/schema-$(date +%Y%m%d).sql
```

- 사진(Storage)은 별도 — `supabase storage` CLI 또는 Dashboard에서 `photos` 버킷 일괄 다운로드.
- 복구는 새 프로젝트 만들어 위 SQL을 차례로 적용.

## 8. 장애 대응 체크리스트

| 증상 | 점검 |
|---|---|
| 로그인은 되지만 모든 목록이 비어 있음 | `users_meta.role = 'guest'`. admin이 역할 부여 필요 |
| "Bucket not found" | 003 마이그레이션 누락 — 재실행 |
| 새 가입자에게 알림 안 옴 | `RESEND_API_KEY`/`WEBHOOK_SECRET` 확인. Database Webhook 활성 상태 |
| 매직링크/재설정 링크 클릭 후 로그인 안 됨 | (1) Supabase Dashboard → Authentication → URL Configuration → Redirect URLs 에 `https://<도메인>/auth/callback` 등록됐는지 (2) 메일 발송 자체 — 무료 티어는 시간당 발송 한도 — Authentication → Logs 확인 (3) 링크는 한 번만 사용 가능, 1시간 후 만료 |
| `/admin/users`에서 사용자 안 보임 | 005 RPC 미적용 또는 호출자 role≠admin |
| 동기화 큐가 안 줄어듦 | `/queue`에서 `last_error` 확인. 최다 발생: RLS 차단(역할/지역), 네트워크, FK 위반(23503 — 사진의 야장이 서버에 없음, 보통 야장 삭제 또는 다른 단말에서 다른 ID 로 재등록) |
| 큐 항목이 "자동 재시도 중단" 상태 | 5회 연속 실패 시 자동 재시도가 멈춤. 원인(보통 RLS 권한·필수 컬럼 누락) 해결 후 `/queue`에서 [지금 재시도]. 데이터를 포기하려면 [큐에서 제거] |
| "서버 충돌" 빨간 배지 | Postgres unique·check 제약 위반(예: `sample_no` 중복). 같은 페이로드로 재시도해도 또 실패. 채취번호를 고친 새 야장으로 다시 저장하거나, 충돌 항목은 [큐에서 제거] |
| PWA 설치 안 됨 | HTTPS 필요. Vercel 도메인에서 시도. `public/icons/*.png` 존재 확인 |
| 사진은 올라갔는데 표시 안 됨 | `photos.storage_path`와 Storage 객체 경로 일치 여부, RLS `photos_read` |
| "DNA 분석 결과" 섹션이 빈 상태로 보임 | 006/008 마이그레이션 미적용. `dna_results` 테이블·`specimen_id` 컬럼·`dna` 버킷 생성 확인. **시편 상세**(`/specimens/<id>`)에서만 보이며 야장 상세에선 안 보입니다(의도). RLS 상 admin/lead 만 작성 가능 |
| 야장 상세에 DNA 결과 섹션이 없어졌어요 | 008 이후 정책: 야장 = 채취 단계 기록(현장). DNA 분석 결과는 추출물 시편(X)을 만든 뒤 그 시편 상세에서 등록. 야장 상세의 「시편」 트리에서 「+ 1차 시편 → X(Extract)」 로 생성 가능 |
| "시편(Specimens)" 섹션이 에러 / 추가 안 됨 | 007 마이그레이션 미적용. `specimens` 테이블·`create_specimen` RPC 확인. 쓰기 권한은 admin/lead. 같은 부모에서 동시 추가 시 `23505` 발생하면 클라이언트가 한 번 더 시도하면 됨 |
| `/events` 목록에서 이미 등록된 야장이 계속 `queued`/`conflict` 배지로 보임 | 010 마이그레이션 누락 또는 옛 sync worker. 010 적용 시 서버에 남아 있던 `queued`/`draft`/`conflict` 행이 일괄 `synced` 로 정정됨. 새로 등록되는 야장은 fix 된 worker 가 `synced` 로 보내므로 정상. `sync_status` 는 단말 내부 상태(Dexie 큐)지 서버 상태가 아님을 기억할 것 |
| `/queue` 에 사진 1건이 계속 `photos_event_id_fkey` (23503) 위반으로 남음 | 그 사진의 야장(`event_id`)이 서버에 없음 = orphan. (1) 옛 단말 코드(PR #14 이전)에서 사용자가 야장만 [큐에서 제거] 했을 때 photos_pending 잔재로 남았을 가능성. v3 sw.js 부터는 abandonQueueItem 이 매달린 사진까지 함께 정리하므로 신규 발생 차단. (2) 기존 잔재는 사진 카드 [지금 재시도] 를 5회 채워 [큐에서 제거] 노출 후 삭제, 또는 PR #14 가 단말에 적용된 뒤 자동으로 빨간 "서버 충돌" 로 분류되면 [큐에서 제거] 노출 |
| 모바일 PWA 가 옛 버전 코드를 계속 실행 (예: 23503 이 충돌이 아닌 일반 실패로 보임, 신규 fix 미반영) | `public/sw.js` 의 `VERSION` 이 안 올라가서 옛 캐시가 남아 있을 가능성. 신규 배포 시 VERSION 을 함께 bump (예: `v3-YYYY-MM-DD`). 사용자 측 즉시 복구는 (iOS) 설치된 홈 화면 앱 삭제 후 재설치, (Android Chrome) 설정 → 사이트 설정 → 사이트 데이터 삭제 |
| `sites_code_key` (23505) 충돌로 야장이 동기화 안 됨 | EventForm 은 매번 새 site uuid 를 발급하는데, 같은 `site_code` 가 다른 단말/사용자에 의해 이미 서버에 있는 경우 발생. **글로벌 마스터 정책**상 같은 code 면 하나의 사이트로 취급해야 한다. fix(워커 lookup): site_code/tree_local_no 를 서버에서 사전 조회해 server uuid 를 차용. 다른 region 의 같은 code 라 RLS 로 lookup 결과가 비어 있으면 여전히 충돌 가능 — 운영 측에서 담당 region 매핑 보강하거나 사용자가 자기 권한 범위로 코드를 재지정 |

## 9. 의존성 보안

`npm audit` 으로 정기적으로 확인합니다. 현재 알려진 잔여 advisory와 처리 방침:

| 패키지 | 등급 | 내용 | 처리 |
|---|---|---|---|
| `postcss` (transient via next) | moderate | XSS via unescaped `</style>` | Next 내부 종속이라 직접 업그레이드 불가. PostCSS 가 사용자 입력을 CSS string 으로 만들지 않으므로 실질 위험은 낮음. Next 차기 패치 대기 |

업그레이드 절차:

```bash
npm outdated                  # 어떤 패키지가 뒤처져 있는지
npm install <pkg>@<ver>       # 명시 버전으로
npm audit                     # 잔여 advisory 확인
npm run typecheck && npm run build
```

> ⚠️ `npm audit fix --force` 는 메이저 업그레이드를 강행해 호환성을 깰 수 있습니다. 항상 명시 버전으로 단계적 업그레이드 + 빌드/QA 후 머지하세요.
