# 대체 배포 가이드 — Supabase/Vercel 없이 운영

표준 셋업([DEPLOYMENT.md](DEPLOYMENT.md))은 Supabase + Vercel 조합입니다. 이 문서는 그 둘 중 일부 또는 전부를 자체/타사 인프라로 옮길 때의 옵션과 절차를 정리합니다.

> 결론 먼저:
>
> - **가장 손쉬운 옮김**: Self-hosted Supabase(Docker) + 프론트 호스팅만 다른 곳. → 코드 수정 없음.
> - **Supabase 자체를 떼어내는 것**: 인증·DB·Storage 세 가지 책임을 다른 컴포넌트로 분할. 코드 수정 큼.
> - **Vercel 만 떼어내는 것**: 가장 작음. Next 15 가 돌면 어디든.

## 목차

1. [의존성 매트릭스 — 무엇이 어디에 묶여 있나](#1-의존성-매트릭스--무엇이-어디에-묶여-있나)
2. [옵션 A. Self-hosted Supabase (Docker) + 외부 호스팅](#2-옵션-a-self-hosted-supabase-docker--외부-호스팅)
3. [옵션 B. Vercel 만 대체 (Supabase 는 그대로)](#3-옵션-b-vercel-만-대체-supabase-는-그대로)
   - [B1. Docker 컨테이너](#b1-docker-컨테이너)
   - [B2. PM2 + Nginx (전통 VPS)](#b2-pm2--nginx-전통-vps)
   - [B3. Cloudflare Pages / Netlify / 기타 PaaS](#b3-cloudflare-pages--netlify--기타-paas)
4. [옵션 C. Supabase 도 갈아끼우기 (코드 수정 필요)](#4-옵션-c-supabase-도-갈아끼우기-코드-수정-필요)
   - [C1. 자체 Postgres + PostgREST + GoTrue + MinIO](#c1-자체-postgres--postgrest--gotrue--minio)
   - [C2. 완전 다른 백엔드 (대규모 수정)](#c2-완전-다른-백엔드-대규모-수정)
5. [백업·복구·이관 절차](#5-백업복구이관-절차)
6. [비용 비교 (참고치)](#6-비용-비교-참고치)
7. [어느 옵션을 고를까](#7-어느-옵션을-고를까)

---

## 1. 의존성 매트릭스 — 무엇이 어디에 묶여 있나

| 책임 | 현재 (Supabase + Vercel) | 코드 의존 | 대체 가능성 |
|---|---|---|---|
| **Database** (PostgreSQL) | Supabase 관리형 Postgres | PostgreSQL 표준 + Supabase RLS 헬퍼 (`auth.uid()`, `auth.role()`) | 모든 Postgres 14+ 호스팅 가능. `auth.users`·`auth.uid()` 만 호환 |
| **Auth** (가입·로그인·세션) | Supabase Auth (GoTrue) | `@supabase/ssr`, `@supabase/supabase-js` | 호환 SDK 가 거의 없음 — Supabase 동등 컴포넌트(GoTrue) 사용 권장 |
| **REST API** | PostgREST (Supabase 자동) | `.from(...).select().eq()` 등 | PostgREST 직접 호스팅 시 그대로 호환 |
| **Storage** (사진·DNA 파일) | Supabase Storage (S3 + 메타) | `sb.storage.from('photos').upload/createSignedUrl` | MinIO·자체 S3·R2 등 S3 호환이면 가능. signed URL 발급 흐름이 다르므로 추상화 레이어 필요 |
| **이메일** (가입·재설정·매직링크) | Supabase Auth → 외부 SMTP (선택 Resend) | Supabase 가 발송 | GoTrue / 다른 Auth 도 SMTP 사용 가능 |
| **DB Webhook** | Supabase Database Webhook → `/api/webhooks/new-user` | 운영 환경변수만 | Postgres `LISTEN/NOTIFY` 또는 logical replication 으로 대체 |
| **프론트엔드 호스팅** | Vercel | Next.js 15 App Router, Node runtime | Node 22+ 돌리는 어떤 환경이든. SSR 필요(`output: 'export'` 아님) |
| **CDN/HTTPS** | Vercel 자동 | — | Cloudflare · Caddy · Nginx 등 |
| **PWA Service Worker** | 정적 `public/sw.js` | — | 모든 호스팅에서 동작 (HTTPS 필수) |

## 2. 옵션 A. Self-hosted Supabase (Docker) + 외부 호스팅

**언제 고르나**: 외부에 데이터를 두고 싶지 않고, Supabase 의 편의(Auth+REST+Storage 통합)는 그대로 쓰고 싶을 때. 코드 수정 0줄.

### 준비물

- Linux VPS (8 GB RAM·100 GB SSD 권장). EC2 t3.medium / Hetzner CX22 / Naver Cloud 등.
- Docker · docker-compose
- 도메인 + Let's Encrypt SSL (Caddy 또는 Nginx)

### 단계 요약

1. **Supabase docker-compose 받기**:
   ```bash
   git clone --depth 1 https://github.com/supabase/supabase.git
   cd supabase/docker
   cp .env.example .env
   # .env 에 다음을 설정:
   #   POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, DASHBOARD_PASSWORD,
   #   SITE_URL, API_EXTERNAL_URL, SMTP_HOST 등
   docker compose up -d
   ```
2. **외부 URL 설정** — `.env` 의 `SITE_URL`·`API_EXTERNAL_URL` 을 본인 도메인으로(예: `https://supabase.example.kr`). HTTPS 종단은 Caddy/Nginx 리버스 프록시로:
   ```caddy
   supabase.example.kr {
     reverse_proxy localhost:8000   # Kong gateway
   }
   ```
3. **마이그레이션 적용** — Supabase Studio (포트 8000 의 웹 UI) 의 SQL Editor 에서 `supabase/migrations/001~008` 순서대로 실행. 또는 `psql` 로 직접:
   ```bash
   psql "postgresql://postgres:$POSTGRES_PASSWORD@<host>:5432/postgres" \
     -f supabase/migrations/001_schema.sql \
     -f supabase/migrations/002_rls.sql \
     ...
   ```
4. **Storage 버킷 생성 확인** — 003·006 마이그레이션이 자동 생성.
5. **Auth URL Configuration** — Supabase Studio → Authentication → URL Configuration 에 `https://woodbank.example.kr/auth/callback` 등 등록.
6. **첫 admin 부여** — [DEPLOYMENT.md §6](DEPLOYMENT.md) 와 동일.
7. **앱 환경변수** — `NEXT_PUBLIC_SUPABASE_URL` 을 자체 도메인으로:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://supabase.example.kr
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<.env 의 ANON_KEY>
   SUPABASE_SERVICE_ROLE_KEY=<.env 의 SERVICE_ROLE_KEY>
   ```
8. **프론트엔드** 는 옵션 B 중 하나로 호스팅.

### 운영 주의

- **백업**: `docker exec supabase-db pg_dump` 정기 실행 + Storage 폴더(`/var/lib/docker/volumes/.../storage`) 별도 백업.
- **업데이트**: 분기마다 `git pull && docker compose pull && docker compose up -d`. 메이저 버전은 release notes 확인.
- **모니터링**: Docker 컨테이너 health check · pg_stat · disk usage. Prometheus + Grafana 가 흔함.

## 3. 옵션 B. Vercel 만 대체 (Supabase 는 그대로)

Supabase URL 만 그대로 가리키면 어디서든 동작합니다. 다음 호스팅이 흔히 쓰이는 대안:

### B1. Docker 컨테이너

Next.js 15 는 standalone 빌드를 지원합니다.

```js
// next.config.mjs
export default {
  output: "standalone",
  // ... 나머지 설정
};
```

**Dockerfile**:
```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

빌드·실행:
```bash
docker build -t woodbank-app .
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL=... \
  -e NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
  woodbank-app
```

리버스 프록시(Caddy/Nginx)로 HTTPS 종단 + 도메인 연결.

> Next 15 의 standalone 빌드는 `.next/standalone/server.js` 와 `public/` · `.next/static/` 을 함께 복사해야 정적 자산이 서빙됩니다. (Dockerfile 의 두 COPY 단계 모두 필수)

### B2. PM2 + Nginx (전통 VPS)

VPS 에 Node 22 설치 후:

```bash
git clone <repo> /opt/woodbank
cd /opt/woodbank
cp .env.example .env.local
# .env.local 채우기
npm ci
npm run build
npm install -g pm2
pm2 start "npm start" --name woodbank --env production
pm2 save
pm2 startup    # 부팅 시 자동 시작
```

**Nginx** (`/etc/nginx/sites-available/woodbank`):
```nginx
server {
  listen 443 ssl http2;
  server_name woodbank.example.kr;
  ssl_certificate     /etc/letsencrypt/live/woodbank.example.kr/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/woodbank.example.kr/privkey.pem;

  location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
server {
  listen 80;
  server_name woodbank.example.kr;
  return 301 https://$host$request_uri;
}
```

SSL은 `certbot --nginx -d woodbank.example.kr` 로 발급(Let's Encrypt 무료).

**업데이트 배포**:
```bash
cd /opt/woodbank
git pull
npm ci
npm run build
pm2 reload woodbank
```

### B3. Cloudflare Pages / Netlify / 기타 PaaS

| 서비스 | 동작 | 주의 |
|---|---|---|
| **Cloudflare Pages** | `@cloudflare/next-on-pages` 어댑터 사용. 무료 티어 관대 | Node 런타임 일부 API 미지원 — 빌드 시 호환 체크 필요. middleware OK |
| **Netlify** | Next.js 어댑터 자동 감지 | SSR 함수로 동작. cold start 가 약간 느림 |
| **Render / Railway / Fly.io** | Dockerfile 또는 buildpack | Vercel 과 거의 동일. 가격 다름 |
| **AWS Amplify** | Next.js SSR 지원 | 환경변수 콘솔에 등록 |
| **Naver Cloud / KT Cloud** | Docker 또는 일반 VM | 한국 인프라 필요 시. B1 또는 B2 와 동일 |

선택 기준:
- **무료 베타** → Cloudflare Pages (관대한 무료 티어) 또는 Vercel Hobby.
- **자체 도메인·통제** → B1·B2.
- **공공기관 클라우드 정책** → Naver/KT Cloud + B1·B2.

## 4. 옵션 C. Supabase 도 갈아끼우기 (코드 수정 필요)

데이터를 Supabase 가 아닌 인프라에 직접 두려는 경우. **코드 변경이 큽니다** — 다음을 권장하지 않지만 필요할 때 참고.

### C1. 자체 Postgres + PostgREST + GoTrue + MinIO

Supabase 가 묶어준 컴포넌트를 직접 구성. 코드는 거의 그대로 동작:

| Supabase | 대체 |
|---|---|
| PostgreSQL | 자체 Postgres 14+ (RDS · Cloud SQL · 직접 설치) |
| PostgREST (REST API) | <https://postgrest.org> Docker 이미지로 |
| GoTrue (Auth) | <https://github.com/supabase/gotrue> Docker |
| Storage | <https://github.com/supabase/storage> 또는 MinIO + 자체 어댑터 |
| Realtime (미사용) | — |
| Studio (관리 UI) | <https://github.com/supabase/supabase> 의 studio 컴포넌트 |

이 조합은 **본질적으로 self-hosted Supabase 와 같으나 각 컴포넌트 버전을 독립 관리** 한다는 차이만 있습니다. 거의 항상 옵션 A(통합 docker-compose) 가 더 단순합니다.

### C2. 완전 다른 백엔드 (대규모 수정)

Express + Postgres + JWT 직접 / Hasura(GraphQL) / Firebase / AWS Amplify Auth 등으로 가는 경우. 다음을 모두 다시 작성해야 합니다:

- `src/lib/supabase/{client,server,admin}.ts` — 새 SDK 로 교체
- `src/middleware.ts` — 새 세션 검증
- 모든 `sb.from(...).select().eq(...)` 쿼리 — 새 API 모양
- `sb.storage.from(...).upload/createSignedUrl` — 새 Storage SDK
- 마이그레이션 — RLS 가 새 DB 의 권한 시스템에 맞춰 재작성

작업량은 보통 1–2 인일·주 단위. 가능하면 **옵션 A 가 권장**.

## 5. 백업·복구·이관 절차

기존 Supabase → 새 백엔드로 데이터 이전:

### A → A 이관 (Supabase → self-hosted Supabase)

```bash
# 1. 원본에서 덤프
supabase db dump --linked --data-only > data.sql
supabase db dump --linked --schema-only > schema.sql

# 2. Storage 다운로드 (Supabase Studio 또는 CLI)
supabase storage download photos ./storage/photos
supabase storage download dna ./storage/dna

# 3. 새 인스턴스에 적용
psql "$NEW_DB_URL" -f schema.sql
psql "$NEW_DB_URL" -f data.sql
# Storage 는 새 인스턴스의 Storage API 또는 docker volume 으로 복사
```

### 앱 측 보강 — 큐에 있는 데이터까지

사용자별 단말의 IndexedDB 큐 데이터는 서버에 없습니다. 이관 전에 모든 사용자에게:

1. `/queue` 의 「📦 백업 ZIP」 다운로드
2. 새 환경으로 옮긴 뒤 `/admin/import` 의 「📦 ZIP 가져오기」 로 복원 (queue.json 만, 사진은 야장 등록 후 개별 첨부)

이 절차는 야장이 손실되지 않도록 베타 기간에 미리 사용자에게 안내합니다.

## 6. 비용 비교 (참고치)

| 옵션 | 월 비용 | 운영 부담 | 데이터 통제 |
|---|---|---|---|
| Supabase Free + Vercel Hobby | 0 원 | 낮음 | 낮음 (외부 클라우드) |
| Supabase Pro + Vercel Pro | ~$45 | 낮음 | 낮음 |
| **A. Self-hosted Supabase + Vercel** | VPS ~ ₩10–30 K | 중간 | 중간 |
| **A. Self-hosted Supabase + B2 자체 VPS** | VPS ~ ₩15–30 K + 도메인 | **중간-높음** | 높음 |
| **B3. Cloudflare Pages + Supabase Free** | 0 원 | 낮음 | 낮음 |
| C. 완전 다른 백엔드 | 인프라 + 개발자 시간 | 높음 | 높음 |

> 데이터 양·트래픽에 따라 크게 변동. 베타 0–5명 수준은 어떤 옵션이든 무료 티어로 충분.

## 7. 어느 옵션을 고를까

| 상황 | 추천 |
|---|---|
| 학술·연구 그룹, 5–20명, 베타·일상 운영 | **현재(Supabase + Vercel)** 유지 |
| 외부 클라우드에 데이터 두기 불가 (기관 정책) | **A. Self-hosted Supabase + B2 자체 VPS** |
| Vercel 만 못 쓰는 경우(요금·정책) | **B. Vercel 만 대체** (B1·B2·B3 중 하나) |
| 기존 Hasura/Firebase 인프라 있음 | **C2** (큰 작업, 사전 검토 필요) |
| 30 명 이상·고가용성 필요 | Supabase Pro + Vercel Pro 또는 A + 이중화 |

---

## 부록: 자주 묻는 것

**Q. `output: 'export'` 정적 빌드로 모든 곳에 올릴 수 없나?**
A. 미들웨어·서버 컴포넌트·API 라우트가 모두 SSR 가정이라 안 됩니다. PWA 정적 부분만 export 하고 API 는 별도 인스턴스로 분리하면 가능하지만 큰 재구조화.

**Q. 자체 Postgres 만 갖고 있고 Auth/Storage 는 다른 곳을 쓰고 싶다.**
A. 가능하지만 RLS 가 Supabase 의 `auth.uid()` 를 가정합니다. 새 Auth 가 발급하는 JWT 의 `sub` 클레임을 같은 방식으로 노출하면 호환 — 그래서 GoTrue 또는 GoTrue 호환 Auth(Supertokens 등)가 가장 매끄럽습니다.

**Q. iOS Safari 의 매직링크가 안 된다는 보고가 있어요.**
A. 자체 호스팅에서도 Site URL/Redirect URL 설정이 동일하게 필요합니다 ([DEPLOYMENT.md §5](DEPLOYMENT.md)). iOS Safari 는 다른 앱으로 링크가 열리지 않도록 같은 도메인에서 시작·종료해야 합니다.
