# CLAUDE.md — woodbank-app 작업 가이드

목재 재감 시료 채취 야장 PWA. Claude Code로 작업할 때 참고할 핵심 컨텍스트만 모아 둡니다.

## 스택 요약

- **프론트**: Next.js 15 (App Router, server components) + React 19 + Tailwind + TypeScript strict
- **백엔드**: Supabase (Postgres + Auth + Storage + RLS) — `@supabase/ssr` 0.10.x
- **오프라인**: PWA + Service Worker + Dexie(IndexedDB) 동기화 큐
- **사진/스프레드시트**: `browser-image-compression`(1600px·85% JPEG) + `exifr` + `exceljs`
- **지도**: `maplibre-gl` (OSM 타일)
- **배포**: Vercel (`output: 'export'` 아님 — Node 서버 필요)

> **Next 15 비동기 Request API 주의** — `cookies()`, `headers()`, 페이지의 `params`/`searchParams` 는 모두 Promise. 서버 컴포넌트/route handler 에서 항상 `await`. 헬퍼 `getSupabaseServer()` 도 async, 호출 시 `const sb = await getSupabaseServer();`

## 자주 쓰는 명령

```bash
npm run dev          # http://localhost:3000
npm run typecheck    # tsc --noEmit (PR 전 필수)
npm run lint         # next lint
npm run build        # 프로덕션 빌드 확인
npm test             # Vitest 단위 테스트 (PR 전 필수)
npm run test:watch   # Vitest 감시 모드
npm run test:e2e     # Playwright 스모크 (사전 1회: npm run test:e2e:install)
```

테스트 가이드는 [docs/TESTING.md](docs/TESTING.md). 새 순수 함수를 추가하면 `*.test.ts` 도 함께.

## 폴더 구조 (핵심만)

```
src/
├── app/
│   ├── (app)/           # 인증 필요 — layout이 세션 보장
│   │   ├── sites|trees|events|profile|queue/
│   │   └── admin/{users,import,export,export/print}/
│   │   ├── stats/                # 통계 대시보드 (RLS 권한 범위 내)
│   │   └── specimens/            # 시편 추적 (상세·라벨 인쇄). 야장에서 파생되는 모든 시편(D/C/B/L/T/F/X/R/O) 다단계 계층
│   ├── api/admin/invite/        # service_role 키로 이메일 초대
│   ├── api/webhooks/new-user/   # Resend로 admin에게 가입 알림
│   ├── auth/{reset,update}-password/
│   └── login/
├── components/          # EventForm·PhotoSlot·BulkImporter 등
├── lib/
│   ├── db/{dexie,queue}.ts      # IndexedDB·큐
│   ├── sync/worker.ts           # 동기화 워커
│   ├── photo/{compress,exif}.ts
│   ├── export/{excel,docx,fetch,types}.ts
│   ├── supabase/{client,server,admin}.ts
│   └── auth/role.ts             # getCurrentUserAndRole
└── types/db.ts          # 도메인 타입 (직접 관리, supabase gen 안 씀)

supabase/migrations/     # 001~005 — 순서대로 적용
public/{sw.js, manifest.webmanifest, icons/}
```

## 오프라인 동기화 흐름

1. `EventForm`/`PhotoSlot` → `enqueueEvent()` / `enqueuePhoto()` ([src/lib/db/queue.ts](src/lib/db/queue.ts))
2. Dexie 테이블: `sync_queue`, `photos_pending`, `sampling_events(sync_status)`
3. `syncOnce()`가 큐를 순회하며 Supabase `upsert` ([src/lib/sync/worker.ts](src/lib/sync/worker.ts))
4. 성공 → `markSynced` (큐에서 삭제), 실패 → `markFailed` (retries 증가 + 지수 백오프)
5. `installAutoSync()`가 online 이벤트 + 5분 주기로 자동 실행
6. 재시도 정책: `MAX_RETRIES=5`, 백오프 30s→1m→5m→30m→2h. 초과 시 자동 재시도 중단되어 `/queue`에서 사용자가 [재시도] 또는 [큐에서 제거]로 처리.
7. 충돌 감지: Postgres `23505`(unique 위반, 예: sample_no 중복)·`23514`(check 위반)는 `markConflict`로 즉시 자동 재시도 중단되고 `sync_status='conflict'`로 표시. UI에서 빨간 "서버 충돌" 배지.
8. PWA Service Worker([public/sw.js](public/sw.js)): 정적 자산 precache + navigation stale-while-revalidate + cache-first asset + offline fallback. 새 배포 시 `VERSION` 상수를 올려 캐시 무효화. Background Sync(`'woodbank-sync'` 태그)는 지원되는 환경에서 OS가 온라인 복귀를 감지해 페이지에 `woodbank:sync-now` 이벤트로 큐 동기화를 트리거.

**주의**: Dexie 스키마를 바꾸면 `version(N+1).stores(...)` 추가 필수. 기존 사용자 단말에 데이터가 있을 수 있다.

## 인증·역할 모델

- 5단계: `admin / lead / surveyor / collaborator / guest`
- `users_meta.role` + `user_region_assignments(sigungu_code, role)`로 RLS 결정
- 신규 가입자는 트리거로 `guest` 자동 생성 ([005_admin_helpers.sql](supabase/migrations/005_admin_helpers.sql))
- 서버 가드: 라우트 페이지 상단에서 `await requireRole(["admin", ...])` ([src/lib/auth/guard.ts](src/lib/auth/guard.ts)) — 권한 부족 시 친절한 403 페이지(`/forbidden`)로 redirect
- RLS가 1차 보안. 프론트 가드는 UX 위주(빠른 차단·안내).

## RLS 변경 시 체크리스트

1. `supabase/migrations/`에 새 파일 (006_*.sql) 추가, idempotent하게 작성 (`drop policy if exists`)
2. `supabase/tests/rls/` pgTAP 테스트 갱신 ([docs/OPERATIONS.md](docs/OPERATIONS.md) 참고)
3. README의 마이그레이션 순서에 새 파일 번호 추가

## 환경변수

`.env.local` (로컬), Vercel Environment Variables (운영). 자세한 운영 셋업은 [docs/OPERATIONS.md](docs/OPERATIONS.md).

| 변수 | 필수 | 용도 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | 모든 클라이언트 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | RLS 적용 클라이언트 |
| `SUPABASE_SERVICE_ROLE_KEY` | 운영 | admin invite API (절대 클라이언트 노출 금지) |
| `RESEND_API_KEY` | 운영 | 신규 가입 알림 메일 |
| `ADMIN_NOTIFY_EMAILS` | 운영 | 알림 받을 admin 이메일 (쉼표 구분) |
| `WEBHOOK_SECRET` | 운영 | Supabase Database Webhook 검증 |
| `NEXT_PUBLIC_SITE_URL` | 운영 | 이메일 redirect 기준 도메인 |
| `RESEND_FROM_EMAIL` | 선택 | 검증된 발신 도메인 |
| `VWORLD_API_KEY` | 선택 | 좌표→주소 자동 채우기(서버 전용). 미설정 시 OSM Nominatim fallback |

## 코드 컨벤션

- 모든 UI 문자열은 **한국어**. 에러 메시지도 한국어.
- 서버 컴포넌트는 가능한 한 `async function ...`로 데이터 직접 fetch.
- 클라이언트 컴포넌트(`"use client"`) 안에서는 Supabase는 `getSupabaseBrowser()` 사용.
- Tailwind 유틸 클래스, 공통 스타일은 `btn-primary` 등 컴포넌트화 (확인: layout/globals).
- Zod로 입력 검증 (특히 폼·API 라우트).
- `any`는 Supabase 조인 결과 같은 데서만 어쩔 수 없이 — 새 코드에선 지양.

## 흔한 함정

- **마이그레이션 누락**: 005까지 모두 적용해야 `/admin/users`(RPC 의존)·신규 가입 트리거 동작. 006 미적용 시 야장 상세의 DNA 결과 섹션, 007 미적용 시 시편 섹션이 동작하지 않는다.
- **`photos` 버킷 미생성**: 003 마이그레이션이 만듦. "Bucket not found" 오류면 003 누락.
- **`user_region_assignments` 비어 있음**: lead/surveyor가 RLS로 차단됨. SQL이나 `/admin/users`에서 매핑 필수.
- **service_role 키 유출**: RLS 우회 슈퍼유저 키. Vercel 환경변수에만, Production·Preview만 체크. Development는 미체크하고 로컬은 `.env.local` 사용.
- **PWA 아이콘 누락**: `public/icons/icon-192.png`, `icon-512.png` 없으면 설치 시 깨짐. 임시로 단색 PNG라도 넣어둘 것.

## 작업 시 권장

- 새 기능 → 가능하면 `(app)` 그룹 안에. 인증 미들웨어가 자동 적용됨.
- 새 admin 전용 화면 → `(app)/admin/` 아래. 페이지 상단에서 `await requireRole(["admin"])` (또는 lead 포함). RLS도 이중으로 보장.
- 새 입력 폼 → 이상치 안내가 필요한 측정값(수고/DBH/고도/방위 등)이면 [src/lib/validation/event.ts](src/lib/validation/event.ts)의 검증을 활용하거나 같은 패턴으로 추가. 입력은 막지 말고 **안내(warn)** 만.
- 새 마이그레이션 → 번호 순서대로, 가능하면 `if not exists` / `drop ... if exists`로 재실행 안전하게.
- 동기화 큐 페이로드 형태 변경 시 → 기존 큐에 남아 있는 항목이 깨질 수 있음. payload에 `version` 필드 두는 것이 안전.
