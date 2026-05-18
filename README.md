# Woodbank — 목재 재감 구축 연구그룹 현장 야장

「재감 시료 채취 야장」을 모바일에서 즉시 기록하고, 오프라인에서도 안전하게 저장 후 자동 동기화하는 PWA 풀스택 스캐폴드입니다. 구성 결정 배경과 권한·데이터 모델 세부는 동봉된 `목재재감DB_구축계획서_v1.0.docx`를 참고하세요.

> **🧪 내부 베타 진행 중 (v0.1)** — 시험에 참여하시는 분은 [docs/BETA.md](docs/BETA.md) 를 먼저 읽어주세요. 알려진 한계 · 골든 패스 · 피드백 채널이 모두 적혀 있습니다.

## 📚 문서 안내

| 누구를 위한 문서 | 어디로 |
|---|---|
| **시험·일반 사용자** | [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — 가입·로그인·야장 입력·시편·통계·내보내기·라벨 인쇄·트러블슈팅 |
| **베타 참여자** | [docs/BETA.md](docs/BETA.md) — 알려진 한계 + 골든 패스 + 피드백 채널 |
| **설치·배포(Supabase + Vercel)** | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — 처음 셋업부터 점검 체크리스트까지 |
| **다른 환경으로 옮길 때** | [docs/DEPLOYMENT_ALTERNATIVES.md](docs/DEPLOYMENT_ALTERNATIVES.md) — self-hosted Supabase / Docker / Cloudflare / Nginx |
| **일상 운영 (역할·백업·장애)** | [docs/OPERATIONS.md](docs/OPERATIONS.md) — 환경변수·마이그레이션·pgTAP·복구·장애 대응 |
| **시스템 구조** | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 컴포넌트·데이터 흐름·시나리오별 처리 |
| **테스트** | [docs/TESTING.md](docs/TESTING.md) — Vitest·Playwright·pgTAP·CI 예시 |
| **개발자 컨텍스트** | [CLAUDE.md](CLAUDE.md) — 스택·폴더·동기화 흐름·코드 컨벤션·흔한 함정 |

## 0. 한눈에 보기

| | |
|---|---|
| 프론트엔드 | Next.js 15 (App Router) + React 19 + Tailwind |
| 백엔드 | Supabase (PostgreSQL + Auth + Storage + RLS) |
| 오프라인 | PWA + Dexie(IndexedDB) 큐 + 클라이언트 사진 압축(1600px·85% JPEG) |
| 권한 | 5단계 역할(`admin / lead / surveyor / collaborator / guest`) RLS |
| 호스팅 | Vercel (또는 GitHub Pages — `output: 'export'` 모드) |

## 1. Supabase 프로젝트 만들기

1. <https://supabase.com> 에 가입 후 **New Project** — Region은 `Northeast Asia (Seoul, ap-northeast-2)` 권장.
2. 프로젝트가 만들어지면 좌측 메뉴 **SQL Editor**를 열고, 아래 파일을 **순서대로** 복사·실행:
   1. `supabase/migrations/001_schema.sql`
   2. `supabase/migrations/002_rls.sql`
   3. `supabase/migrations/003_storage_and_triggers.sql`
   4. `supabase/migrations/004_seed.sql`
   5. `supabase/migrations/005_admin_helpers.sql`
   6. `supabase/migrations/006_dna_results.sql`
   7. `supabase/migrations/007_specimens.sql`
   8. `supabase/migrations/008_dna_to_specimens.sql`
   9. `supabase/migrations/009_regions_full_seed.sql`
   10. `supabase/migrations/010_normalize_sync_status.sql`
   11. `supabase/migrations/011_dna_backfill_to_specimens.sql`
   12. `supabase/migrations/012_open_internal_read.sql`
   13. `supabase/migrations/013_admin_users_with_auth_meta.sql`
3. **Storage** → `photos` 버킷이 생성되었는지 확인. (003 스크립트가 자동 생성)
4. **Project Settings → API** 에서 다음 두 값을 복사:
   - `Project URL` → `.env.local` 의 `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

> Supabase CLI(`supabase db push`)를 쓰면 더 깔끔하지만, 최초 1회는 위처럼 SQL Editor에서 붙여넣어 적용해도 충분합니다.

### 첫 사용자(Admin) 만들기

Supabase는 일반 가입자는 `guest` 역할로 시작합니다. 첫 admin은 SQL로 직접 부여합니다.

1. **Authentication → Users** 화면에서 **Add user → Send invitation** 또는 본인 계정으로 가입.
2. SQL Editor에서 본인 계정에 admin을 부여:
   ```sql
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
3. 이후 다른 사용자는 Admin이 화면(또는 SQL)에서 역할을 부여합니다.

### 담당 지역(조사책임자/조사원) 매핑

```sql
insert into user_region_assignments (user_id, sigungu_code, role)
values (
  (select id from auth.users where email = 'lead@example.com'),
  '46710',          -- 담양군
  'lead'            -- 또는 'surveyor'
);
```

## 2. 로컬 실행

```bash
cd woodbank-app
cp .env.example .env.local
# .env.local 을 열어 SUPABASE_URL / ANON_KEY 채우기
npm install
npm run dev
# http://localhost:3000 접속
```

로그인 후 `/events/new` 에서 야장을 작성해보세요. **비행기 모드**로 전환하고 저장 → 다시 켰을 때 자동 동기화되는지 검증하면 오프라인 흐름이 모두 동작합니다.

## 3. PWA 아이콘

`public/icons/icon-192.png`, `public/icons/icon-512.png` 파일을 본인 로고로 교체하세요. 임시로는 단색 이미지를 넣어두어도 PWA 설치는 가능합니다.

## 4. Vercel 배포

```bash
# Vercel CLI 사용 시
npm i -g vercel
vercel              # 안내에 따라 프로젝트 연결
vercel --prod
```

또는 Vercel 웹콘솔에서:

1. GitHub repo 연결.
2. **Environment Variables** 에 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` 추가.
3. Deploy.

도메인 연결은 **Project → Settings → Domains**.

## 5. 폴더 구조

```
woodbank-app/
├── supabase/migrations/        # 001~004 SQL — Supabase에 순서대로 적용
├── public/                     # PWA 매니페스트, sw.js, 아이콘
└── src/
    ├── app/
    │   ├── login/              # 로그인 (비밀번호 + 매직 링크)
    │   └── (app)/              # 인증 필요한 영역
    │       ├── sites/          # 조사지점 목록·상세
    │       ├── trees/          # 개체목 상세 (재방문 이력)
    │       ├── events/new/     # 야장 입력 폼 (핵심)
    │       ├── queue/          # 동기화 큐 + 충돌 확인
    │       └── admin/          # 관리자 대시보드
    ├── components/             # EventForm, PhotoSlot, GpsPicker, SpeciesPicker, OnlineStatusBar
    └── lib/
        ├── supabase/           # client/server
        ├── db/                 # Dexie IndexedDB + 큐 헬퍼
        ├── sync/               # 백그라운드 동기화 워커
        ├── photo/              # 압축·EXIF
        └── auth/               # role 조회
```

## 6. 다음 단계 권장

| 우선순위 | 항목 | 상태 / 비고 |
|---|---|---|
| 높음 | RLS 회귀 테스트 (pgTAP) | ✅ [supabase/tests/rls/01_rls_smoke.sql](supabase/tests/rls/01_rls_smoke.sql) — 실행 방법은 [docs/OPERATIONS.md §6](docs/OPERATIONS.md) |
| 높음 | 사용자 추가/역할 변경 UI | ✅ `/admin/users` 구현 완료 |
| 높음 | 오프라인 동기화 안정성 | ✅ 재시도 상한·지수 백오프·서버 충돌 감지 ([CLAUDE.md](CLAUDE.md) 「오프라인 동기화 흐름」) |
| 높음 | 역할 가드 일관화 + 403 페이지 | ✅ `requireRole()` + `/forbidden` ([src/lib/auth/guard.ts](src/lib/auth/guard.ts)) |
| 중간 | MapLibre 지도 뷰 | ✅ `/sites?view=map` — OSM 타일 + 개체목 마커, 클릭 시 상세로 이동 |
| 중간 | CSV 내보내기 | ✅ UTF-8(BOM) CSV — [src/lib/export/csv.ts](src/lib/export/csv.ts) |
| 중간 | 한국어 행정구역 reverse geocoding | ✅ VWorld(키 있을 때) + OSM Nominatim fallback — [src/lib/geocode/reverse.ts](src/lib/geocode/reverse.ts), `/events/new` 의 「좌표로 주소 채우기」 |
| 낮음 | DNA 분석 결과 테이블 + 업로드 | ✅ `dna_results` 테이블 + `dna` Storage 버킷. 008 이후 **시편(specimens) 상세에서 관리** — 야장은 채취 단계만(현장 정보). 마이그레이션 [006](supabase/migrations/006_dna_results.sql) · [008](supabase/migrations/008_dna_to_specimens.sql) |

## 6.1 사용자 관리 강화 기능 셋업 (선택)

다음 두 기능은 추가 환경변수가 필요합니다.

### A. 관리자 초대 (메일로 가입 링크 발송)

운영 도메인에서 `/admin/users` 페이지의 「+ 새 사용자 초대」가 동작하려면 service_role 키가 필요합니다.

1. Supabase Dashboard → Project Settings → API → **service_role** 키 복사
2. Vercel 프로젝트 → Settings → Environment Variables → 추가:
   - `SUPABASE_SERVICE_ROLE_KEY` = 위에서 복사한 키 (**Production·Preview만 체크. Development 미체크 — 로컬 .env.local 사용**)
   - `NEXT_PUBLIC_SITE_URL` = `https://woodbank-app.vercel.app` (본인 운영 도메인)
3. Redeploy

⚠️ service_role 키는 RLS를 우회하는 슈퍼유저 키입니다. 절대 클라이언트 코드나 Git에 노출 금지.

### B. 신규 가입 시 admin 이메일 알림

이메일은 외부 서비스 [Resend](https://resend.com) 무료 티어(3,000통/월)를 사용합니다.

**1) Resend 셋업**

1. resend.com 가입 → 좌측 **API Keys** → **Create API Key**
2. (선택) 좌측 **Domains** → 본인 도메인 추가 + DNS 레코드 등록. 도메인 검증 안 하면 `onboarding@resend.dev`로만 발송 가능.

**2) Vercel 환경변수**

| 변수 | 값 |
|---|---|
| `RESEND_API_KEY` | Resend에서 발급받은 키 (`re_xxx...`) |
| `ADMIN_NOTIFY_EMAILS` | 알림 받을 admin 이메일. 쉼표로 여러 명 가능 |
| `RESEND_FROM_EMAIL` | (선택) 검증된 도메인이 있다면 `Woodbank <noreply@your.kr>` |
| `WEBHOOK_SECRET` | 32자 이상 임의 문자열 (Supabase ↔ Vercel 간 검증용) |

**3) Supabase Database Webhook 설정**

Supabase Dashboard → **Database** → **Webhooks** → **Create new hook**

| 항목 | 값 |
|---|---|
| Name | `notify-new-user` |
| Table | `auth.users` |
| Events | **Insert** 만 체크 |
| Type | HTTP Request |
| HTTP method | POST |
| URL | `https://woodbank-app.vercel.app/api/webhooks/new-user` |
| HTTP Headers | `X-Webhook-Secret`: 위 WEBHOOK_SECRET 과 동일 값 |

Save. 이제 누군가 가입하면 admin이 자동으로 이메일을 받습니다.

⚠️ Resend 미설정 시: 이메일은 안 가지만 `/admin` 대시보드에 「역할 미배정 사용자 N명」 노란 배너가 자동으로 떠서 인앱 알림은 항상 동작.

## 7. 트러블슈팅

- **로그인은 되는데 sites 목록이 비어 있다** → `users_meta` 에 본인 role이 `guest` 인 상태. admin이 SQL로 역할 갱신 필요.
- **PWA 설치 안 됨** → HTTPS에서만 동작. 로컬은 `localhost` 면 가능, 외부 접근은 Vercel 배포 후 확인.
- **사진 업로드 실패: "Bucket not found"** → 003 마이그레이션 적용 누락. SQL Editor에서 재실행.
- **RLS 차단으로 INSERT 실패** → `user_region_assignments`가 비어 있을 가능성. lead·surveyor에게 담당 지역 코드를 매핑.
- **`/events` 목록에서 등록된 야장이 계속 `queued` 배지로 보임** → 010 마이그레이션 누락 또는 sync worker가 옛 버전. 010 적용 후 새로 등록되는 야장은 정상. 옛날에 등록된 행도 010 의 일괄 update 로 정정됨.
- **Supabase 프로젝트가 자동 일시중지** → Free 티어는 7일간 외부 API 호출이 없으면 paused. `vercel.json` 의 cron(`/api/cron/keepalive`)이 매일 1회 PostgREST 를 건드려 방지. Vercel 환경변수 `CRON_SECRET` 등록 필수. 자세한 셋업은 [docs/OPERATIONS.md §2.5](docs/OPERATIONS.md#2-vercel-배포-셋업).

---

문의/이슈는 GitHub repo 또는 운영 책임자에게.
