# Markdown 작성 권한과 Bonifacio 연결

이 문서는 저장소의 구현과 운영 적용 절차를 설명한다. 현재 서버에 적용됐다는 증거는 아니다. 이 작업에서 운영 배포, 서버 재시작, 비밀값 생성·교체, 사용자 권한 변경은 실행하지 않았다.

## 권한 계약

- 공개 글과 `/blog/` 화면은 로그인 없이 읽을 수 있다. `/blog/write`는 편집 화면이며, 내용·초안·저장 기능은 `/blog/api/author/` API를 사용한다.
- 작성자는 Bonifacio의 불변 사용자명 `cks` 한 명이다. 이메일·표시 이름·`admin` 역할만으로 권한을 얻을 수 없다.
- 운영 API는 중앙 인증 경계가 확인한 `Remote-User: cks`, 아래 v2 역할·앱 권한 목록, Blog 전용 `X-Portfolio-Edge-Secret`을 매번 확인한다. `developer`가 포함된 구계약이나 v2 표식이 없는 헤더는 허용하지 않는다.
- POST·PUT 등 쓰기 요청은 설정된 공개 URL의 정확한 `Origin`과 `/blog/api/author/session`에서 받은 `X-CSRF-Token`도 필요하다. 토큰은 작성자·공개 출처·전용 비밀값에 묶이며, 별도 비밀번호나 로그인 쿠키를 만들지 않는다.
- 인증 미완료는 `401 login_required`, 다른 사용자나 위조 헤더는 `403 author_forbidden`, 잘못된 출처·토큰은 `403 invalid_origin`·`invalid_csrf_token`이다. 설정이 없으면 작성 API만 `503 author_unavailable`로 닫힌다.
- 서버 로그는 인증·사용자 헤더, 쿠키, CSRF 토큰을 가린다. 요청 본문·응답의 토큰을 별도로 로그에 추가하지 않는다.

Bonifacio의 `ops/sso/role-contract.json` v2에 따라 `Remote-Groups`는 `user`, `user,admin`, `user,admin,chief-admin` 중 정확한 역할 접두부 다음에 `portfolio-v2`가 와야 한다. 일반 사용자·관리자는 이후 `access-react`, `access-vue`, `access-dukkeobi`, `access-ddit-finalproject`, `access-monitor`, `access-pilgrimage`, `access-multtara`, `access-feelmyrythm`, `access-garak` 중 부여된 권한을 이 순서대로 받는다. `chief-admin`은 앱에 암묵적으로 접근하므로 별도 `access-*` 그룹이 없어야 한다. 공백·중복·순서 변경·알 수 없는 그룹·빈 항목·역할 계층 누락은 거절한다. 예를 들어 `user,admin,chief-admin,portfolio-v2`는 유효하지만, 다른 사용자가 그 역할을 가져도 Blog 작성자는 될 수 없다.

최신 Nginx의 `/internal/authelia/authz`는 중앙 계정 서비스의 `/internal/catalog/authz`를 거쳐 Authelia에 세션을 확인한다. 중앙 브로커는 Blog 작성 API도 기존 앱과 같이 위 고정 앱 목록으로 권한 헤더를 추려 전달해야 한다. 운영 중 등록한 앱의 `access-*` 그룹은 Blog 파서에 그대로 전달하지 않는다. Blog는 공개 경로로 예약돼 있어 앱 카탈로그에 새로 등록하거나 `access-blog` 권한을 만들 필요가 없다. `/blog/api/author/`의 명시적 `user:cks` ACL과 서버의 동일 사용자명 검사가 작성 권한을 결정한다.

`scripts/portfolio-auth-mode.sh`가 직접 실행·이미지·Compose에서 사용하는 동일한 분기 규칙을 확인한다. `main`의 인증 모드는 `sso`이며, 기능 브랜치는 `local`이다. 과거 `dev` 분기 규칙은 해석기에 남아 있지만 배포 대상으로 사용하지 않는다. 사용자명을 바꾸려면 Blog 설정과 Bonifacio의 명시적 사용자 ACL을 함께 검토해야 하며, 한쪽 설정만 변경해서 다른 사용자에게 권한이 생기지는 않는다.

## 네이티브 로컬 개발

로컬 PostgreSQL 개발 DB를 연결한 상태에서 기능 브랜치로 실행한다. `BLOG_DATABASE_URL`은 운영 DB를 가리키면 안 된다.

```sh
BLOG_LOCAL_AUTHOR=true \
BLOG_HOST=127.0.0.1 \
BLOG_PUBLIC_BASE_URL=http://127.0.0.1:5176/blog \
npm run dev
```

브라우저는 `http://127.0.0.1:5176/blog/write`로 연다. 서버는 비운영 환경, `local` 인증 모드, 명시적인 `BLOG_LOCAL_AUTHOR=true`, 루프백 바인딩·공개 URL·실제 접속 소켓을 모두 요구한다. 요청의 `Host`도 설정된 출처와 일치해야 하므로 다른 도메인을 루프백으로 연결한 접근은 거절한다. 전달된 IP 헤더는 로컬 권한 근거로 사용하지 않는다.

기본 웹 개발 서버도 `127.0.0.1`에 바인딩한다. 로컬 작성 기능을 켠 상태에서 Vite의 `--host`를 외부 주소로 덮어쓰거나 외부 접근 가능한 프록시·터널을 붙이지 않는다.

기본 Docker 개발 구성에서는 이 우회를 켜지 않는다. Docker 프록시의 내부 소켓은 루프백이 아니므로 위 설정은 네이티브 개발용이다. 운영 환경에서는 `BLOG_LOCAL_AUTHOR=true`를 지정해도 시작이 거절된다.

## 운영 연결에 필요한 로컬 변경

Blog 저장소:

- `docker-compose.prod.yml`: 작성자 기본값 `cks`, 비밀값 환경 변수 또는 컨테이너 내부 파일 경로 지원. 로컬 작성 우회는 항상 꺼진다.
- `docker-compose.author.yml`: 운영자 소유 비밀 파일을 읽기 전용 Docker secret으로 연결하는 선택적 구성. 이 파일을 사용하지 않는 기존 공개 배포에는 없는 파일의 마운트를 강제하지 않는다.
- `.env.example`: 필요한 변수 이름만 기록하며 실제 비밀값은 포함하지 않는다.

Bonifacio 저장소(`../Bonifacio`):

- `ops/sso/configuration.yml`: `/blog/api/author/`에 `user:cks` 허용 규칙과 후속 거절 규칙을 추가한다.
- `ops/sso/nginx/blog-public.conf`: 작성 API만 Authelia 인증 후 루프백 API 포트 `9176`으로 보낸다. 공개 페이지는 기존 웹 포트 `5176`을 사용하고 사용자·쿠키·비밀 헤더를 제거한다.
- `ops/sso/sync_edge_secrets.py blog`: `/home/cks/.config/blog/sso-edge-secret`과 `/etc/nginx/snippets/blog-edge-secret.conf`를 같은 값으로 생성하거나 재사용한다. 기존 값을 출력하거나 암묵적으로 교체하지 않는다.

## 승인 후 운영자 적용 순서

운영 적용 전 배포할 두 저장소의 정확한 커밋, 현재 Blog·SSO 이미지, Nginx/Authelia 설정 백업, 실제 루트리스 Docker 사용 여부를 확인한다. Blog와 공용 SSO·Nginx를 건드리는 작업이므로 기존 배포 잠금과 롤백 절차를 따른다.

1. Bonifacio 체크아웃에서 `sudo python3 ops/sso/sync_edge_secrets.py blog`를 실행한다. 이 명령은 Blog 전용 파일을 `cks` 소유, 디렉터리 `0700`, 파일 `0640`으로 만들고 Nginx 스니펫을 root 전용 `0600`으로 쓴다. 명령은 값 자체를 출력하지 않는다.
2. 비밀값 전달 방식 중 하나를 선택한다.
   - **파일 권장:** `BLOG_SSO_EDGE_SECRET_HOST_FILE=/home/cks/.config/blog/sso-edge-secret`을 설정하고, 배포·검증·롤백 모두 `docker-compose.prod.yml`과 `docker-compose.author.yml`을 함께 사용한다. 추가 구성은 컨테이너에 `/run/secrets/blog_sso_edge_secret`을 읽기 전용으로 연결하고 보조 그룹 `0`을 부여한다. 기존 루트리스 Docker의 파일 소유권 매핑에서 읽을 수 있어야 하며, 파일을 공개 권한으로 바꾸지 않는다.
   - **환경 변수 대안:** 기존 배포기가 `docker-compose.prod.yml`만 처리한다면 운영자의 비공개 환경에서 `BLOG_SSO_EDGE_SECRET`에 동일한 값을 공급하고 `BLOG_SSO_EDGE_SECRET_FILE`은 비운다. 비밀값을 명령 인자·로그·문서·커밋에 노출하지 않는다. 두 방식을 동시에 설정하면 서버는 거절한다.
3. 운영 Blog의 `BLOG_AUTHOR_USERNAME=cks`, `BLOG_PUBLIC_BASE_URL=https://bonifacio.work/blog`, `PORTFOLIO_BRANCH=main`, `PORTFOLIO_AUTH_MODE=sso`를 확인한다. 파일 방식을 사용하는 경우, 제한된 배포기도 같은 두 Compose 파일을 사용하도록 승인된 서버 작업에 포함해야 한다. 기존 단일 파일 배포 명령은 추가 구성을 자동으로 읽지 않는다.
4. 최종 Compose 구성은 값을 출력하지 않고 검사한다.

   ```sh
   sh scripts/portfolio-auth-mode.sh exec -- \
     docker compose -f docker-compose.prod.yml -f docker-compose.author.yml config --quiet
   ```

5. 승인된 Blog 이미지를 적용하고 공개 건강 검사와 글 조회를 확인한다. Authelia의 새 ACL을 설치한 뒤 기존 SSO 배포 절차로 적용한다. Redis와 SSO 영구 볼륨은 유지한다.
6. `blog-public.conf`를 `/etc/nginx/snippets/bonifacio-blog-public.conf`에 설치한다. 해당 스니펫은 기존 TLS 서버에 한 번만 포함하며 `/internal/authelia/authz`의 기존 내부 위치가 있어야 한다. `nginx -t` 성공 후 승인된 reload를 수행한다.
7. 아래 결과를 실제 서버에서 확인하고, 비밀값·쿠키·CSRF 토큰을 보고에 포함하지 않는다.

| 확인                                             | 기대 결과                          |
| ------------------------------------------------ | ---------------------------------- |
| 로그인 없는 `/blog/`, 공개 글, `/blog/api/posts` | 기존과 같이 공개 조회              |
| 로그인 없는 `/blog/api/author/session`           | JSON `401 login_required`          |
| 다른 Bonifacio 사용자                            | `403`, 초안·저장 접근 불가         |
| `cks`로 로그인한 `/blog/write`                   | 작성 화면 및 작성자 세션 사용 가능 |
| 외부에서 만든 `Remote-*` 헤더 또는 직접 API 접근 | Nginx에서 교체되거나 앱에서 거절   |
| 출처나 CSRF 토큰이 없는 저장                     | `403`, DB 변경 없음                |
| `cks`로 초안 저장·다시 열기                      | 같은 내용 유지                     |
| 로그아웃 후 작성 API 호출                        | `401`, 기존 토큰만으로 접근 불가   |

실패 시 작성 API를 다시 비공개로 닫고 이전 Nginx/Authelia 설정과 SSO 이미지로 되돌린다. 두 비밀 파일은 임의로 회전·삭제하지 않는다. 웹에서 저장한 글이 생긴 뒤에는 `editor_managed`를 모르는 이전 Blog 이미지가 seed를 실행하면 수정본을 덮어쓸 수 있으므로, Blog 이미지 롤백은 [운영 문서의 데이터 보존 조건](OPERATIONS.md)을 먼저 충족해야 한다. 저장된 글과 새 DB 스키마를 되돌리는 작업은 데이터 복구 계획에 따라 별도로 판단하며, 볼륨 삭제로 복구하지 않는다.
