# 아키텍처 개요 — Woodbank

전체 시스템이 어떤 컴포넌트로 구성되고, 사용자 한 동작이 어떻게 흘러가는지 한 페이지로 정리. 깊이 있는 운영은 [DEPLOYMENT.md](DEPLOYMENT.md) · [OPERATIONS.md](OPERATIONS.md), 코드 작업 컨텍스트는 [CLAUDE.md](../CLAUDE.md).

## 1. 큰 그림

```
                    ┌─────────────────────────────────┐
                    │   사용자 (모바일·데스크톱)         │
                    │   PWA (Service Worker + Dexie)  │
                    └────────────┬────────────────────┘
                                 │ HTTPS
                                 ▼
                    ┌─────────────────────────────────┐
                    │   Next.js 15 (App Router)       │
                    │   - Server Components           │
                    │   - Route Handlers (API)        │
                    │   - middleware (auth check)     │
                    │   - 클라이언트 컴포넌트            │
                    │   호스팅: Vercel (또는 대체)      │
                    └────────────┬────────────────────┘
                                 │ supabase-js / ssr
                                 ▼
        ┌────────────────────────────────────────────────────┐
        │                  Supabase 스택                       │
        │                                                    │
        │   GoTrue (Auth) ──┐                                 │
        │   PostgREST ──────┼──► PostgreSQL                  │
        │   Storage S3 API ─┘    (RLS 정책)                  │
        │                                                    │
        │   호스팅: Supabase 관리형 또는 self-hosted Docker    │
        └────────────────────────────────────────────────────┘
                                 ▲
                                 │ 외부 연동
                ┌────────────────┼────────────────┐
                ▼                ▼                ▼
       Resend (이메일)    VWorld API       OpenStreetMap
       알림·재설정         reverse geocode   타일·Nominatim
```

## 2. 컴포넌트 책임

### 프론트엔드 (`src/`)

| 위치 | 책임 |
|---|---|
| `app/(app)/**` | 인증 필요 라우트. 야장·시편·통계·관리 등 |
| `app/login`, `app/auth/**` | 로그인·매직링크·비밀번호 재설정·콜백 |
| `app/api/**` | 서버 라우트(admin 초대, 웹훅, reverse geocode) |
| `components/**` | 화면 컴포넌트 (EventForm·PhotoSlot·SpecimenManager·DnaResultManager…) |
| `lib/supabase/{client,server,admin}.ts` | Supabase 클라이언트 3종 — 브라우저/서버/관리자(service_role) |
| `lib/db/{dexie,queue}.ts` | IndexedDB(오프라인) + 동기화 큐 |
| `lib/sync/worker.ts` | 백그라운드 동기화 워커 (online/visibility/timer/Background Sync) |
| `lib/photo/{compress,exif}.ts` | 사진 압축·EXIF 추출 |
| `lib/export/{excel,csv,docx,zip,fetch,types}.ts` | 5가지 내보내기 |
| `lib/geocode/reverse.ts` | VWorld + Nominatim fallback |
| `lib/specimens/api.ts` | 시편 CRUD + 트리 빌더 + 부모 체인 |
| `lib/stats/aggregate.ts` | 통계 순수 함수 (numStats·countBy·histogram·monthlyTimeline) |
| `lib/validation/event.ts` | 이상치 안내 + Haversine 거리 |
| `lib/auth/{role,guard}.ts` | 역할 조회 + requireRole(redirect) |
| `middleware.ts` | 미인증 시 /login redirect, Supabase 일시 장애 fail-safe |
| `types/db.ts` | 도메인 타입 (Site·Tree·SamplingEvent·Photo·Specimen·DnaResult …) |

### 백엔드 (Supabase)

- **PostgreSQL** — `supabase/migrations/001~008` 로 정의된 스키마. RLS 정책으로 사용자별 행 필터링.
- **GoTrue (Auth)** — 이메일·비밀번호 + 매직링크(PKCE) + 비밀번호 재설정. JWT 발급.
- **PostgREST** — 테이블·뷰·RPC 를 자동 REST API 화. 클라이언트가 `sb.from(...).select()...` 로 호출.
- **Storage** — S3 호환. 버킷 `photos`(야장 사진), `dna`(DNA 결과 첨부). RLS로 접근 제어.
- **Database Webhook** — `auth.users` INSERT 시 `/api/webhooks/new-user` 로 POST (Resend 이메일 트리거).

### 외부 서비스 (모두 선택)

- **Resend** — 신규 가입 알림 메일. 미설정 시 `/admin` 의 노란 배너로 대체.
- **VWorld** — 한국 행정구역 reverse geocoding. 미설정 시 Nominatim fallback.
- **OpenStreetMap** — 지도 타일(`maplibre-gl` + raster source) + Nominatim.

## 3. 핵심 데이터 모델

```
species  regions  users_meta  user_region_assignments  collaborator_shares  audit_log
                │                            │
                ▼                            ▼
       ┌──── sites ────┐              사용자·권한
       │   region_*    │
       └──────┬────────┘
              │
       ┌── trees ──────────┐
       │   site_id         │
       │   species_code    │
       │   lat/lon/...     │
       └────────┬──────────┘
                │
       ┌── sampling_events ─────┐    ← 야장(현장 채취 기록)
       │   tree_id              │
       │   sample_no (unique)   │
       │   dna_collected        │
       │   sync_status          │
       └─────────┬──────────────┘
                 │
         ┌── specimens ──────────┐     ← 파생 시편 다단계
         │   root_event_id       │
         │   parent_id (자유 깊이)│
         │   type_code D/C/B/L/.. │
         │   human_code (uq)     │
         └─────────┬─────────────┘
                   │
            ┌── dna_results ──┐         ← DNA 분석 결과
            │  specimen_id    │
            │  identification │
            │  similarity     │
            │  file_path      │
            └─────────────────┘

photos                ← 야장에 직접 매달림(채취 시 4종 사진)
   event_id
```

## 4. 시나리오별 데이터 흐름

### 4-1. 새 야장 등록 (오프라인 OK)

```
사용자 입력 → EventForm
  ├─ Tree·Site·SamplingEvent 객체 생성 (UUIDv7)
  ├─ Dexie 트랜잭션:
  │    - sites/trees/sampling_events put
  │    - sync_queue add (kind=sampling_event)
  ├─ PhotoSlot 4종: 압축 → photos_pending put → sync_queue add (kind=photo)
  └─ navigator.onLine ? syncOnce() : 큐에 보존

syncOnce (online + 5분 / Background Sync / visibility 이벤트 발화)
  ├─ sync_queue 순회
  ├─ kind=sampling_event:  sites/trees/sampling_events upsert
  │     └─ sync_status 는 단말 내부 상태이므로 서버 전송 시 항상 'synced' 로 강제
  │        (그러지 않으면 단말이 enqueue 때 찍은 'queued' 가 서버에 박혀
  │         /events 목록에서 영원히 'queued' 배지로 보임)
  ├─ kind=photo:           Storage upload + photos insert
  ├─ 23505/23514 → markConflict (자동 재시도 중단)
  ├─ retries < 5 → 지수 백오프(30s→2h)
  └─ retries ≥ 5 → 사용자가 /queue 에서 [재시도]/[제거]
```

### 4-2. 매직링크 로그인

```
사용자 /login → signInWithOtp({ emailRedirectTo: /auth/callback?next=... })
   ↓ Supabase GoTrue 가 이메일 발송
사용자 메일 링크 클릭
   ↓ Supabase 가 token verify 후 → /auth/callback?code=...&next=...
/auth/callback route handler
   ├─ supabase.auth.exchangeCodeForSession(code)  → 세션 쿠키 set
   └─ NextResponse.redirect(next)
미들웨어 다음부터 통과 → /sites 등 보호 경로 접근 가능
```

### 4-3. 시편 추가 + DNA 분석 결과

```
야장 상세 /events/[id] → SpecimenManager 「+ 1차 시편 → X(Extract)」
   ↓ RPC create_specimen(root_event_id, null, 'X', 'extract', ...)
   ├─ 권한 검사 (is_admin or is_lead_for(site))
   ├─ 같은 parent + type 의 max(seq_no)+1 결정
   ├─ human_code = sample_no + '.X' + zero-pad(seq)
   └─ specimens insert (sibling unique 인덱스가 동시성 보장)

새 X 시편 상세 /specimens/[id] → DnaResultManager 「+ 결과 추가」
   ├─ dna_results insert with specimen_id
   └─ (선택) 첨부 파일 → Storage 'dna' 버킷 → file_storage_path update
```

### 4-4. 라벨 인쇄

```
야장 상세 「🏷 라벨 인쇄」 → /specimens/print?event=<id>&mode=a4
   ↓ server component: 시편 fetch
   ↓ SpecimenPrintClient (use client)
      ├─ 모드(A4 격자/단일) · 라벨 크기 · QR 텍스트 옵션
      ├─ 각 라벨: SpecimenQrCode 컴포넌트 (qrcode 동적 import → SVG)
      └─ window.print() → 브라우저 인쇄 / 라벨 프린터로
```

### 4-5. 내보내기 (ZIP)

```
/admin/export → fetchEventsForExport(filter)
   ↓ server: events + photos signed URLs (15분)
ExportControls 「📦 ZIP」
   ↓ client: buildExportZipFromEvents
      ├─ 각 사진 signed URL fetch → Blob
      ├─ sites/trees 정규화
      ├─ queue.json (format_version 1, source=server)
      ├─ photos/<event>/<photo>.jpg
      ├─ README.txt
      └─ ZIP blob 다운로드
```

## 5. 권한 모델 한눈에

```
                      auth.uid()
                          ↓
                   users_meta.role  ──┐
                                      ├──► current_user_role() (SECURITY DEFINER)
   user_region_assignments(role, sigungu_code) ──┐
                                                  │
                                                  ▼
                              ┌─────────────────────────────────┐
                              │ RLS 정책 (sites/trees/events/   │
                              │  photos/specimens/dna_results)  │
                              │                                 │
                              │   is_admin()                    │
                              │   is_lead_for(sigungu_code)     │
                              │   is_surveyor_for(sigungu_code) │
                              │   has_collab_access(site_id)    │
                              └─────────────────────────────────┘
                                            ↓
                                   행별 read/write 허용·차단
```

## 6. 캐싱·성능

- **PWA Service Worker** (`public/sw.js`):
  - precache: `/`, `/manifest.webmanifest`, 아이콘
  - navigation: stale-while-revalidate (즉시 마지막 화면 + 백그라운드 갱신)
  - 정적 자산: cache-first
  - Supabase/API/외부 지도 타일: 캐시 안 함
  - 새 배포: `VERSION` 상수 올리면 이전 캐시 정리
- **Background Sync API** (Android Chrome/Firefox): 인터넷 복귀 시 OS 가 SW 깨움 → `'woodbank-sync'` 메시지 → 페이지의 `installAutoSync` 가 큐 동기화
- **Dexie IndexedDB**: 단말 영속. 페이지 닫고 재방문해도 큐 그대로
- **Server Components**: 초기 HTML 에 데이터 포함 — 첫 화면 빠름
- **dynamic imports**: maplibre-gl, qrcode, JSZip 은 useEffect 안에서 lazy load — 메인 번들 가벼움

## 7. 보안 요약

- **Row-Level Security** 가 1차 방어. 클라이언트 가드는 UX 위주(빠른 차단·안내).
- **Service role 키**는 서버 라우트(`/api/admin/invite`)에서만, Vercel 환경변수의 Prod/Preview 만 체크.
- **Storage** 는 인증 사용자만 read/insert. signed URL 15분 만료.
- **PKCE flow** 매직링크. /auth/callback 가 server-side 에서 code → session 교환.
- **Webhook 검증** — `X-Webhook-Secret` 헤더가 환경변수와 일치하지 않으면 401.
- **Reverse geocode API** 는 로그인 사용자만 (외부 무차별 호출 방지).
- **잔여 advisory** — `npm audit` 의 postcss(transient) 1건. [OPERATIONS.md §9](OPERATIONS.md).

## 8. 한계·트레이드오프

- 새 야장만 오프라인 큐 사용. 편집·사진 추가/삭제는 즉시 서버 호출.
- 통계는 메모리 집계(5000 건 한도). 큰 데이터에선 RPC/MV 로 이전 필요.
- 무료 티어 한도 (Supabase/Vercel/Resend) — 베타·소규모는 무관, 다인원은 유료.
- Background Sync 는 Chromium 계열만. iOS Safari 는 안전망(visibility·timer)으로 동작.
- IGSN/ARK 등 외부 표준 식별자는 컬럼만 비워 둠(향후 매핑).

## 9. 폴더 트리 (의미 그룹)

```
woodbank-app/
├── src/
│   ├── app/                       (Next.js App Router)
│   ├── components/                (화면 컴포넌트)
│   ├── lib/                       (도메인 로직)
│   ├── types/                     (TS 타입)
│   └── middleware.ts
├── supabase/
│   ├── migrations/                (001~008 SQL)
│   └── tests/rls/                 (pgTAP 회귀)
├── public/
│   ├── sw.js                      (PWA Service Worker)
│   ├── manifest.webmanifest
│   └── icons/                     (PWA 아이콘)
├── scripts/                       (운영 보조 스크립트)
├── tests/
│   └── e2e/                       (Playwright 스모크)
├── docs/
│   ├── USER_GUIDE.md
│   ├── DEPLOYMENT.md
│   ├── DEPLOYMENT_ALTERNATIVES.md
│   ├── ARCHITECTURE.md            ← 이 문서
│   ├── OPERATIONS.md
│   ├── BETA.md
│   └── TESTING.md
├── CLAUDE.md
└── README.md
```
