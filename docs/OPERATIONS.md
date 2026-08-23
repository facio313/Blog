# Blog 운영 및 배포 계약

이 문서는 `https://bonifacio.work/blog/`에서 독립적으로 실행되는 Blog 애플리케이션의 저장소 측 운영 계약을 정의한다. Bonifacio 저장소는 랜딩 페이지와 공용 SSO edge를 소유하며 이 저장소의 배포가 그 파일을 변경하지 않는다. RPi의 제한 배포기, host Nginx route, Bonifacio 앱 카드 등록은 별도의 운영 작업이다.

## 1. 공개 경로와 프로세스

| Surface       | 내부 주소                               | 공개 주소                          |
| ------------- | --------------------------------------- | ---------------------------------- |
| Web           | `http://127.0.0.1:5176/blog/`           | `https://bonifacio.work/blog/`     |
| API           | `http://127.0.0.1:9176/blog/api/`       | `https://bonifacio.work/blog/api/` |
| Web readiness | `http://127.0.0.1:5176/healthz`         | 공개할 필요 없음                   |
| API readiness | `http://127.0.0.1:9176/blog/api/health` | host edge 정책에 따라 공개 가능    |

Web image는 `/blog`를 `/blog/`로 308 redirect하고 `/blog/assets/`에는 immutable cache, SPA 문서에는 `no-cache`, `/blog/api/`에는 `no-store`를 적용한다. `/`를 비롯한 Blog namespace 밖의 경로는 404다. API health는 PostgreSQL에 `SELECT 1`이 성공할 때만 `{"ok":true}`를 반환하고 장애 세부 정보는 노출하지 않는다.

모든 host port는 loopback에만 bind한다. 외부 client는 container origin이나 `9176`에 직접 접근하지 않고 TLS host Nginx를 통과해야 한다.

## 2. Branch authentication 및 image provenance

[`scripts/portfolio-auth-mode.sh`](../scripts/portfolio-auth-mode.sh)가 모든 build와 runtime의 canonical resolver다.

| Branch         | Mode    |
| -------------- | ------- |
| `main`, `dev`  | `sso`   |
| 그 밖의 branch | `local` |

명시적 `PORTFOLIO_BRANCH`가 우선이며, 없으면 `GITHUB_REF_NAME`, 마지막으로 현재 Git branch를 사용한다. 명시한 `PORTFOLIO_AUTH_MODE`가 branch와 다르면 실패한다. Server/Web image는 build branch와 mode를 `/etc/portfolio-auth-build` 및 OCI label에 기록하고 runtime의 두 값이 build 기록과 다르면 시작하지 않는다.

현재 Blog의 읽기 API는 공개다. `sso`는 보호 branch의 배포 provenance 계약이며, 향후 글쓰기/admin API가 추가될 때 해당 route만 Bonifacio SSO와 앱 전용 edge secret으로 보호해야 한다. 공개 글 전체를 SSO 뒤로 옮기거나 독립 비밀번호 체계를 추가하지 않는다.

## 3. 로컬 Compose

Docker가 있는 ARM64 개발 환경에서는 resolver가 canonical 변수를 내보내게 한 뒤 Compose를 실행한다.

```sh
scripts/portfolio-auth-mode.sh exec -- docker compose up --build
```

로컬 Compose만 전용 `blogDb`를 생성한다. `blogServerDev`와 `blogWebDev`도 production image와 같은 non-root/read-only 경계를 사용하며, 데이터베이스만 `blog-dev-postgres-data` volume에 보존한다.

종료할 때 일반적으로 volume을 삭제하지 않는다.

```sh
scripts/portfolio-auth-mode.sh exec -- docker compose down
```

`docker compose down -v`는 로컬 DB를 의도적으로 초기화할 때만 사용한다. Production에서는 stack-wide `down`, `down -v`, global image/system prune을 실행하지 않는다.

## 4. RPi 사전 준비

Production Compose는 PostgreSQL을 생성하지 않는다. 운영자가 공유 `cksDB` 안에 Blog 전용 database와 최소권한 login role을 만들고, host에 이미 존재하는 external Docker network `cksDB`를 사용한다. 다른 앱의 database나 role을 재사용하지 않는다.

운영 `.env`는 저장소 밖의 operator-owned 경로에 mode `0600`으로 둔다. 최소 항목은 다음과 같다.

```dotenv
PORTFOLIO_BRANCH=main
PORTFOLIO_AUTH_MODE=sso
BLOG_IMAGE_TAG=<exact-lowercase-40-character-main-sha>
BLOG_DATABASE_URL=postgresql://blog:<private-password>@cksDB:5432/blog
BLOG_PUBLIC_BASE_URL=https://bonifacio.work/blog
BLOG_LOG_LEVEL=info
```

`BLOG_IMAGE_TAG`에는 `latest`, branch tag, 축약 SHA를 넣지 않는다. 실제 database password는 `.env.example`, Compose, CI log, shell argument, 문서에 기록하지 않는다.

Host Nginx는 `/blog/`를 `127.0.0.1:5176`으로 proxy하고 client가 origin port에 직접 접근하지 못하게 한다. `/blog/api/`를 별도 upstream으로 우회시키지 않아도 web container가 `blogServer:9176`으로 전달한다. TLS 종료 proxy는 `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`를 client 입력에서 재구성해야 한다.

## 5. CI와 immutable image publish

`Validate` workflow는 application test/build와 두 Compose 선언을 검증한다. `main` 또는 `dev`의 성공한 Validate만 deploy workflow를 깨운다. Deploy workflow는 event의 정확한 40자 `head_sha`를 다시 checkout하고 현재 checkout SHA와 비교한다.

ARM64 runner는 다음 image를 동일한 SHA tag로 빌드한다.

- `ghcr.io/facio313/blog-server:<sha>`
- `ghcr.io/facio313/blog-web:<sha>`

Runtime image를 만들기 전에 server Docker `test` target이 동일한 `main`/`dev` branch-auth build args를 fail-closed로 검증하고 typecheck와 non-DB content contract suite를 ARM64에서 다시 실행한다. 게시 전에는 정확한 두 runtime image를 digest-pinned PostgreSQL과 격리 network에서 실행하여 다음을 확인한다.

1. migration 및 seed 완료
2. PostgreSQL-backed API readiness와 실제 published-post 조회
3. server UID/GID `10001:10001`, web UID/GID `101:101`
4. read-only root/app와 writable `/tmp`
5. build/runtime branch-auth mismatch의 fail-closed 동작
6. Nginx syntax, `/blog/` SPA fallback, asset cache, API proxy/cache/security headers
7. Blog namespace 밖 `/`의 404

`dev`도 동일 ARM64 build와 runtime smoke를 수행하지만 GHCR push와 RPi 배포를 하지 않는다. `main`만 smoke를 통과한 exact SHA image를 push한다. `latest` tag는 생성하지 않는다.

## 6. 제한 RPi 배포

GitHub deploy job은 공개 host key를 고정한 forced-command SSH key로 다음 요청만 보낸다.

```text
deploy blog <exact-40-character-sha>
```

RPi의 제한 배포기는 이 저장소 밖의 운영 surface다. 배포를 활성화하기 전에 `blog` allowlist와 Compose/env 경로를 등록해야 한다. 호스트 배포기는 여러 portfolio 저장소가 공유하는 전역 lock을 잡고 다음 순서를 지켜야 한다.

1. SHA 형식, GHCR actor/token 입력, 두 target image 존재 확인
2. Blog 이외의 container name/ID snapshot
3. target server image와 현재 DB revision의 호환성 검사
4. Blog 전용 database의 PostgreSQL custom-format backup 및 checksum 기록
5. 기존 서비스를 유지한 채 target server canary를 임시 loopback port에서 시작
6. canary가 migration, seed, `/blog/api/health`를 통과한 뒤 server 승격
7. target web 승격 후 `/healthz`, `/blog/`, `/blog/api/health`, asset을 loopback에서 확인
8. 실제 두 container image ID가 요청 SHA image와 일치하고 비대상 container snapshot이 동일한지 확인

GitHub deploy timeout은 전역 lock의 최대 20분 대기와 검증 시간을 포함해 40분이다.

## 7. Migration, backup, rollback

Server는 PostgreSQL advisory lock 아래에서 아직 적용되지 않은 SQL migration을 이름순으로 한 transaction씩 적용하고 `schema_migrations`에 기록한다. 여러 server가 동시에 시작해도 동일 migration을 중복 적용하지 않아야 한다. Seed는 `source_path` 기준 upsert이며 source hash만 비교하지 않는다. 저장 대상 전체 필드의 row 비교가 `IS DISTINCT FROM`인 경우에만 해당 post를 갱신하므로, source hash가 같아도 slug·상태·렌더링 결과·게시 시각 등 import 결과가 달라지면 갱신하고 완전히 동일한 row는 그대로 둔다.

Schema migration이 시작되기 전 실패는 기존 server/web를 그대로 유지한다. Migration 후 server health가 실패하면 schema와 맞지 않을 수 있는 과거 server image만 자동으로 복귀시키지 않는다. 우선 호환되는 forward-fix image/migration을 배포한다. Database restore는 별도 staging에서 backup을 검증하고 명시적인 outage 및 data-loss 범위를 승인한 경우에만 수행한다. Web image만 실패한 경우 server를 유지한 채 직전 web image로 복귀할 수 있다.

공유 `cksDB` container/network/volume과 다른 database는 Blog 배포 대상이 아니다. Blog 배포기는 이를 생성, 재시작, 중단, 삭제하지 않는다.

## 8. 최초 활성화 체크리스트

- GitHub Repository Secret `DEPLOY_KEY` 등록
- GHCR package 생성/접근 정책 확인
- RPi `cksDB`의 전용 `blog` database/login 및 backup 권한 확인
- mode-0600 production `.env` 설치
- forced deploy dispatcher에 `deploy blog <sha>` 등록
- host Nginx `/blog/` route와 TLS/loopback 연결 설치
- Bonifacio 랜딩 앱 목록에 `/blog/` 링크 등록(별도 저장소 작업)
- `main` Validate → exact-image smoke → push → restricted deploy 1회 수행
- loopback readiness와 공개 `https://bonifacio.work/blog/` 확인
- migration backup/restore rehearsal 기록
