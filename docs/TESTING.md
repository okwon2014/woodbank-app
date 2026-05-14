# 테스트 가이드 — woodbank-app

이 프로젝트는 두 가지 테스트 레이어를 둡니다.

| 레이어 | 도구 | 위치 | 역할 |
|---|---|---|---|
| 단위 (Unit) | Vitest + happy-dom | `src/**/*.test.ts`, `tests/unit/**/*.test.ts` | 순수 함수 — CSV 직렬화, 동기화 큐 헬퍼, 좌표 변환, UUIDv7, 충돌 분류 |
| 통합 (E2E 스모크) | Playwright | `tests/e2e/**/*.spec.ts` | 공개 페이지 렌더링 / 미들웨어 redirect / PWA manifest·Service Worker 헤더 |
| DB / RLS | pgTAP | `supabase/tests/rls/*.sql` | RLS 회귀 — [OPERATIONS.md §6](OPERATIONS.md) 참조 |

## 단위 테스트 (Vitest)

```bash
npm test            # 1회 실행
npm run test:watch  # 파일 변경 감지
npm run test:ui     # 브라우저 UI
```

테스트 파일은 대상 코드 옆에 두는 코로케이션 방식(`src/lib/foo.ts` ↔ `src/lib/foo.test.ts`). 대상 함수가 외부 모듈(예: Dexie, Supabase 클라이언트)에 의존하면 그 함수는 단위 테스트에서 제외하고, **순수 함수만** 추출해 테스트합니다.

현재 커버리지 대상:
- [src/lib/utils.ts](../src/lib/utils.ts) — `cx`, `dmsToDecimal`, `ddToDms`, `nowIsoDate`, `uuidv7`
- [src/lib/export/csv.ts](../src/lib/export/csv.ts) — `buildCsv` (BOM·CRLF·RFC 4180 인용 검증)
- [src/lib/db/queue.ts](../src/lib/db/queue.ts) — `isAbandoned`, `isWaiting`, `isConflict`, `isConflictError`

## E2E 스모크 (Playwright)

처음 한 번 브라우저 다운로드 필요:

```bash
npm run test:e2e:install     # chromium + 의존성
```

실행:

```bash
npm run test:e2e             # webServer 가 자동으로 npm run dev 띄움
# 또는 이미 띄워진 서버에 붙이기:
PLAYWRIGHT_BASE_URL=https://woodbank-app.vercel.app npm run test:e2e
```

현재 검증 항목 ([tests/e2e/public-pages.spec.ts](../tests/e2e/public-pages.spec.ts)):
- `/login` 폼 렌더
- `/auth/reset-password` 폼 렌더
- 미로그인 `/` 접근 시 `/login` 으로 redirect
- `/manifest.webmanifest` Content-Type · 필드
- `/sw.js` Service-Worker-Allowed · no-store 헤더

> Playwright 테스트는 인증된 흐름(야장 등록·동기화 등)은 다루지 않습니다. 그건 별도 통합 환경(로컬 Supabase + seed)이 필요해 별도 단계로 둡니다.

## CI 예시 (GitHub Actions)

`.github/workflows/test.yml` 같은 곳에 다음을 두면 PR 마다 자동 실행됩니다.

```yaml
name: test
on: [push, pull_request]
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run test:e2e:install
      - run: npm run build
      - run: npm run test:e2e
        env:
          NEXT_PUBLIC_SUPABASE_URL: https://example.supabase.invalid
          NEXT_PUBLIC_SUPABASE_ANON_KEY: dummy-anon-key
```

## 새 테스트 추가 시

- **단위**: 대상 파일 옆에 `*.test.ts`. 외부 시스템(IndexedDB, Supabase, 브라우저 fetch) 의존 함수는 vi.mock 으로 잠그거나, 헬퍼만 떼서 테스트.
- **E2E**: 인증 필요한 페이지는 fixture 로 세션 쿠키 주입 + 로컬 Supabase. 현재 PR 스코프 밖.
- **테스트 추가가 새 마이그레이션을 동반하면** [supabase/tests/rls](../supabase/tests/rls) 의 pgTAP 도 함께 갱신.
