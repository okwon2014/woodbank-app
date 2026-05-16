# 설치·배포 가이드 — Supabase + Vercel (정식)

이 문서는 **Supabase + Vercel** 조합으로 처음 셋업하거나 다른 인스턴스로 옮길 때의 표준 절차입니다. 다른 백엔드/호스팅으로 옮기려면 [DEPLOYMENT_ALTERNATIVES.md](DEPLOYMENT_ALTERNATIVES.md) 를, 일상 운영(역할 부여·백업·장애)은 [OPERATIONS.md](OPERATIONS.md) 를 보세요.

## 목차

1. [전제 조건](#1-전제-조건)
2. [Supabase 프로젝트 생성](#2-supabase-프로젝트-생성)
3. [마이그레이션 적용 (DB 스키마)](#3-마이그레이션-적용-db-스키마)
4. [Storage 버킷 확인](#4-storage-버킷-확인)
5. [Auth URL Configuration](#5-auth-url-configuration)
6. [첫 admin 부여](#6-첫-admin-부여)
7. [Vercel 프로젝트 생성·배포](#7-vercel-프로젝트-생성배포)
8. [환경변수 한눈에](#8-환경변수-한눈에)
9. [신규 가입 이메일 알림 (선택)](#9-신규-가입-이메일-알림-선택)
10. [VWorld API 키 (선택)](#10-vworld-api-키-선택)
11. [도메인·SSL](#11-도메인ssl)
12. [PWA 아이콘 교체](#12-pwa-아이콘-교체)
13. [업데이트 배포](#13-업데이트-배포)
14. [로컬 개발 환경](#14-로컬-개발-환경)
15. [점검 체크리스트](#15-점검-체크리스트)

---

## 1. 전제 조건

- GitHub 계정 (소스 호스팅)
- Supabase 계정 — <https://supabase.com>
- Vercel 계정 — <https://vercel.com>
- (선택) Resend 계정 — 이메일 알림
- (선택) VWorld 계정 — 한국 reverse geocoding
- Node 22+ · npm 10+ (로컬 빌드 검증용)

> 무료 티어로 베타·소규모 운영 가능. 상세 한도는 §15.

## 2. Supabase 프로젝트 생성

1. <https://supabase.com> → **New Project**.
2. Region: **`Northeast Asia (Seoul, ap-northeast-2)`** 권장.
3. 데이터베이스 비밀번호는 안전한 곳에 보관(잃어버리면 직접 DB 접속 불가).
4. 프로젝트가 만들어지면 좌측의 메뉴에서:
   - **Project Settings → API** 에서 다음을 메모:
     - `Project URL` → 환경변수 `NEXT_PUBLIC_SUPABASE_URL`
     - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (절대 클라이언트 노출 금지)

## 3. 마이그레이션 적용 (DB 스키마)

좌측 메뉴 **SQL Editor** 에서 아래 8개 파일을 **순서대로** 복사·붙여 실행:

| # | 파일 | 만드는 것 |
|---|---|---|
| 1 | `supabase/migrations/001_schema.sql` | 핵심 테이블(species·regions·users_meta·sites·trees·sampling_events·photos·collaborator_shares·audit_log), enum, set_updated_at 트리거 |
| 2 | `supabase/migrations/002_rls.sql` | RLS 정책 + 헬퍼 함수(is_admin / is_lead_for / is_surveyor_for / has_collab_access / current_user_role) |
| 3 | `supabase/migrations/003_storage_and_triggers.sql` | `photos` Storage 버킷, audit_log 트리거 |
| 4 | `supabase/migrations/004_seed.sql` | 수종·행정구역 마스터 + 담양 13건 샘플 데이터 |
| 5 | `supabase/migrations/005_admin_helpers.sql` | 신규 가입 트리거(`guest` 자동 등록), admin RPC(`admin_users_with_email` · `admin_set_user_role` · `admin_set_user_region` · `admin_set_user_active`) |
| 6 | `supabase/migrations/006_dna_results.sql` | `dna_results` 테이블 + `dna` Storage 버킷 |
| 7 | `supabase/migrations/007_specimens.sql` | 시편 다단계 계층 + `create_specimen` RPC |
| 8 | `supabase/migrations/008_dna_to_specimens.sql` | DNA 결과를 시편 단위로 (`dna_results.specimen_id`) |

> **CLI 가 가능하면**: `supabase db push` 한 번으로 끝. 단, 처음 한 번은 SQL Editor 가 가장 단순.

각 파일은 **idempotent** 하게 작성돼 두 번 실행해도 안전합니다.

## 4. Storage 버킷 확인

좌측 메뉴 **Storage** 에서 다음 두 버킷이 자동 생성됐는지 확인:

- `photos` (003 에서 생성) — 야장 사진
- `dna` (006 에서 생성) — DNA 분석 결과 첨부 파일

없으면 해당 마이그레이션을 다시 실행.

## 5. Auth URL Configuration

**Authentication → URL Configuration**:

- **Site URL**: 운영 도메인 (예: `https://woodbank-app.vercel.app`)
- **Redirect URLs** 에 다음 모두 추가:
  - `https://<운영도메인>/auth/callback` ← **매직링크/재설정 PKCE 처리에 필수**
  - `https://<운영도메인>/auth/update-password` (구버전 호환)
  - 로컬 dev 테스트가 필요하면 `http://localhost:3000/auth/callback`

Redirect URLs 미등록 시 매직링크가 `error=redirect_to_not_allowed` 로 거부됩니다.

## 6. 첫 admin 부여

신규 가입자는 자동으로 `guest`. 첫 운영자는 SQL 로 직접 admin 부여:

1. **Authentication → Users** → 본인 계정으로 가입 또는 「Add user → Send invitation」.
2. SQL Editor 에서:
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
3. 이후 추가 사용자는 admin 이 `/admin/users` UI 또는 SQL 로 역할 부여.

## 7. Vercel 프로젝트 생성·배포

1. GitHub repo 를 Vercel 에 연결 — **New Project → Import Git Repository**.
2. Build Command, Output Directory 는 기본값(Next.js) 그대로.
3. **Environment Variables** — §8 의 표대로 입력. Production·Preview 만 체크하고 Development 는 비워두기(로컬은 `.env.local` 사용).
4. Deploy.
5. 첫 배포 후 `https://<프로젝트>.vercel.app/login` 접속해서 로그인 → `/admin` 진입 확인.

## 8. 환경변수 한눈에

| 변수 | 위치 | 필수 | 설명 |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 모든 환경 | ✅ | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 모든 환경 | ✅ | anon 키 (RLS 적용) |
| `SUPABASE_SERVICE_ROLE_KEY` | 운영 (Prod/Preview) | 운영 필수 | RLS 우회. 클라이언트·Git 절대 노출 금지. admin invite API 가 사용 |
| `NEXT_PUBLIC_SITE_URL` | 운영 | 선택 | 이메일 redirect 기준 도메인 |
| `RESEND_API_KEY` | 운영 | 선택 | 신규 가입 알림 메일 (§9) |
| `ADMIN_NOTIFY_EMAILS` | 운영 | 선택 | 알림 받을 admin 이메일(쉼표 구분). `/forbidden` 페이지의 안내 이메일에도 사용 |
| `RESEND_FROM_EMAIL` | 운영 | 선택 | 검증된 발신 도메인. 미설정 시 `onboarding@resend.dev` |
| `WEBHOOK_SECRET` | 운영 | 선택 | Supabase Database Webhook 검증용 32자 이상 임의 문자열 |
| `VWORLD_API_KEY` | 운영 (서버) | 선택 | 좌표→주소 자동 채우기 (§10). 미설정 시 OSM Nominatim fallback |

로컬은 `.env.local`(.gitignore 됨). 예시는 [.env.example](../.env.example).

## 9. 신규 가입 이메일 알림 (선택)

새 사용자가 가입했을 때 admin 이메일로 자동 알림.

### Resend 셋업

1. <https://resend.com> 가입 → **API Keys → Create API Key**.
2. (선택) **Domains → Add Domain** 으로 본인 도메인 + DNS 레코드 등록. 안 하면 `onboarding@resend.dev` 로만 발송.

### Vercel 환경변수

`RESEND_API_KEY`, `ADMIN_NOTIFY_EMAILS`, `RESEND_FROM_EMAIL`(선택), `WEBHOOK_SECRET` 추가.

### Supabase Database Webhook

Supabase Dashboard → **Database → Webhooks → Create new hook**:

| 항목 | 값 |
|---|---|
| Name | `notify-new-user` |
| Table | `auth.users` |
| Events | **Insert** 만 체크 |
| Type | HTTP Request, POST |
| URL | `https://<운영도메인>/api/webhooks/new-user` |
| HTTP Headers | `X-Webhook-Secret`: `WEBHOOK_SECRET` 과 동일 값 |

이후 누군가 가입하면 admin 들에게 이메일이 자동 발송됩니다.

**Resend 미설정 시 fallback**: `/admin` 대시보드에 「역할 미배정 사용자 N명」 노란 배너가 항상 표시되어 인앱 알림은 유지됩니다.

## 10. VWorld API 키 (선택)

좌표→주소 자동 채우기를 한국 행정구역 정확도로 쓰려면:

1. <https://www.vworld.kr> 인증 → 「인증/API 키 신청」.
2. 키 발급 시 **운영 도메인 등록 필수**.
3. Vercel 환경변수에 `VWORLD_API_KEY` 추가.
4. 미설정 시 OSM Nominatim 으로 자동 fallback (정확도 다소 낮음).

## 11. 도메인·SSL

- Vercel → **Project Settings → Domains** 에서 커스텀 도메인 연결. SSL 인증서는 Vercel 이 자동 발급.
- DNS 는 도메인 등록기관에서 CNAME 또는 A 레코드를 Vercel 안내대로 추가.
- 새 도메인 연결 후 §5 의 Supabase Site URL · Redirect URLs 도 함께 갱신.

## 12. PWA 아이콘 교체

`public/icons/icon-192.png`, `public/icons/icon-512.png` 두 파일이 기본 임시 로고(브랜드 컬러 + W) 로 들어있습니다.

정식 디자인이 준비되면 같은 경로에 덮어쓰기 + commit + push → Vercel 자동 재배포. 사용자는 PWA 캐시 갱신 후 새 아이콘이 적용됩니다(`public/sw.js` 의 `VERSION` 상수도 같이 올리면 즉시 갱신 유도).

## 13. 업데이트 배포

```bash
git pull
# 코드 변경
npm run typecheck && npm test && npm run build  # 로컬 검증
git commit -m "..."
git push                                          # Vercel 이 자동 빌드·배포
```

새 마이그레이션이 있으면 **운영 Supabase SQL Editor 에 적용** 한 뒤 Vercel 배포 완료 확인.

## 14. 로컬 개발 환경

```bash
git clone <repo>
cd woodbank-app
cp .env.example .env.local
# .env.local 에 Supabase URL/anon key 채우기
npm install
npm run dev   # http://localhost:3000
```

자세한 명령은 [CLAUDE.md](../CLAUDE.md) 의 「자주 쓰는 명령」.

## 15. 점검 체크리스트

배포 후 한 바퀴:

- [ ] `/login` 에 본인 이메일로 로그인
- [ ] `/admin` 진입 (admin 만)
- [ ] `/admin/users` 에서 사용자 목록 표시
- [ ] `/events/new` 에서 야장 1건 등록 → `/queue` 에 잠시 보이다 사라짐 → `/events` 목록에 노출
- [ ] `/sites?view=map` 지도에 마커 표시
- [ ] `/stats` 에 통계 표시
- [ ] `/admin/export` 에서 xlsx · CSV · Word · PDF · ZIP 모두 다운로드 가능
- [ ] 야장 상세 → 시편 추가 → `/specimens/<id>` → 「라벨 인쇄」 미리보기
- [ ] (모바일) 운영 도메인에 접속 → 홈 화면에 추가 → 단독 앱으로 실행 → 비행기 모드 + 야장 입력 → 비행기 모드 해제 → 자동 동기화

### 무료 티어 한도

| 서비스 | 한도 (참고) |
|---|---|
| Supabase Free | 500 MB DB, 1 GB Storage, 2 GB 전송, 50 K MAU |
| Vercel Hobby | 100 GB 전송/월, 6 K minutes build, 비상업적 용도 |
| Resend Free | 3 K 메일/월 |
| OSM (지도 타일) | Fair-use 정책 — 베타 규모는 무관 |

장기 운영·다인원 사용 시 Supabase Pro / Vercel Pro 또는 자체 호스팅을 검토 ([DEPLOYMENT_ALTERNATIVES.md](DEPLOYMENT_ALTERNATIVES.md)).
