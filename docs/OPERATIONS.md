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
3. **Storage** → `photos` 버킷이 자동 생성되었는지 확인 (003에서 생성).
4. **Project Settings → API**:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (운영 환경변수에만)
5. **Authentication → URL Configuration**:
   - Site URL: `https://woodbank-app.vercel.app` (운영 도메인)
   - Redirect URLs: `https://woodbank-app.vercel.app/auth/update-password` 등록
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
5. 첫 배포 후 `/admin` 페이지가 열리는지 확인.

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
| `/admin/users`에서 사용자 안 보임 | 005 RPC 미적용 또는 호출자 role≠admin |
| 동기화 큐가 안 줄어듦 | `/queue`에서 `last_error` 확인. 최다 발생: RLS 차단(역할/지역), 네트워크 |
| 큐 항목이 "자동 재시도 중단" 상태 | 5회 연속 실패 시 자동 재시도가 멈춤. 원인(보통 RLS 권한·필수 컬럼 누락) 해결 후 `/queue`에서 [지금 재시도]. 데이터를 포기하려면 [큐에서 제거] |
| "서버 충돌" 빨간 배지 | Postgres unique·check 제약 위반(예: `sample_no` 중복). 같은 페이로드로 재시도해도 또 실패. 채취번호를 고친 새 야장으로 다시 저장하거나, 충돌 항목은 [큐에서 제거] |
| PWA 설치 안 됨 | HTTPS 필요. Vercel 도메인에서 시도. `public/icons/*.png` 존재 확인 |
| 사진은 올라갔는데 표시 안 됨 | `photos.storage_path`와 Storage 객체 경로 일치 여부, RLS `photos_read` |
| "DNA 분석 결과" 섹션이 빈 상태로 보임 | 006 마이그레이션 미적용. `dna_results` 테이블·`dna` 버킷 생성 확인. RLS 상 admin/lead 만 작성 가능 |

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
