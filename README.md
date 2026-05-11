# Woodbank — 목재 재감 구축 연구그룹 현장 야장

「재감 시료 채취 야장」을 모바일에서 즉시 기록하고, 오프라인에서도 안전하게 저장 후 자동 동기화하는 PWA 풀스택 스캐폴드입니다. 구성 결정 배경과 권한·데이터 모델 세부는 동봉된 `목재재감DB_구축계획서_v1.0.docx`를 참고하세요.

## 0. 한눈에 보기

| | |
|---|---|
| 프론트엔드 | Next.js 14 (App Router) + Tailwind |
| 백엔드 | Supabase (PostgreSQL + Auth + Storage + RLS) |
| 오프라인 | PWA + Dexie(IndexedDB) 큐 + 클라이언트 사진 압축(1600px·85% JPEG) |
| 권한 | 5단계 역할(`admin / lead / surveyor / collaborator / guest`) RLS |
| 호스팅 | Vercel (또는 GitHub Pages — `output: 'export'` 모드) |

## 1. Supabase 프로젝트 만들기

1. <https://supabase.com> 에 가입 후 **New Project** — Region은 `Northeast Asia (Seoul, ap-northeast-2)` 권장.
2. 프로젝트가 만들어지면 좌측 메뉴 **SQL Editor**를 열고, 아래 4개 파일을 **순서대로** 복사·실행:
   1. `supabase/migrations/001_schema.sql`
   2. `supabase/migrations/002_rls.sql`
   3. `supabase/migrations/003_storage_and_triggers.sql`
   4. `supabase/migrations/004_seed.sql`
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

| 우선순위 | 항목 | 비고 |
|---|---|---|
| 높음 | RLS 회귀 테스트 (pgTAP) | 외부 협력자가 다른 Site를 못 보는지 등 검증 |
| 높음 | 사용자 추가/역할 변경 UI | 현재 admin은 SQL로 직접 수정 |
| 중간 | MapLibre 지도 뷰 | `/sites?view=map` |
| 중간 | CSV/Excel 내보내기 | `/api/export` 라우트 + Service Role |
| 중간 | 한국어 행정구역 reverse geocoding | VWorld API 등 연동 |
| 낮음 | DNA 분석 결과 테이블 + 업로드 | 별도 마이그레이션 |

## 7. 트러블슈팅

- **로그인은 되는데 sites 목록이 비어 있다** → `users_meta` 에 본인 role이 `guest` 인 상태. admin이 SQL로 역할 갱신 필요.
- **PWA 설치 안 됨** → HTTPS에서만 동작. 로컬은 `localhost` 면 가능, 외부 접근은 Vercel 배포 후 확인.
- **사진 업로드 실패: "Bucket not found"** → 003 마이그레이션 적용 누락. SQL Editor에서 재실행.
- **RLS 차단으로 INSERT 실패** → `user_region_assignments`가 비어 있을 가능성. lead·surveyor에게 담당 지역 코드를 매핑.

---

문의/이슈는 GitHub repo 또는 운영 책임자에게.
