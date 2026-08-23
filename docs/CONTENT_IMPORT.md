# 콘텐츠 가져오기 운영 가이드

이 문서는 기존 `/Users/cksmacbook/Desktop/Develop/Project/_posts/` 보관함을 Bonifacio 블로그 번들과 PostgreSQL로 안전하게 가져오는 기준을 정의한다. 원본은 증거이자 복구 지점이므로 가져오기 과정에서 수정하지 않는다. 공개 상태를 정하는 입력은 `content/import-policy.json`, 유효한 frontmatter, 민감정보 검사 결과이며 폴더명이나 파일명의 `ㅁ` 표시는 보조 정보일 뿐이다.

## 원본 감사 기준선

전체 195개 파일, 920,010바이트를 읽어 확인한 결과는 다음과 같다.

| 구분                     | 개수 | 운영 의미                                         |
| ------------------------ | ---: | ------------------------------------------------- |
| Markdown (`.md` + `.MD`) |  158 | 글 후보와 빈 메모가 혼재                          |
| 독립 HTML                |   27 | 실행 가능한 실습 파일; 공개 글이 아니라 검토 대상 |
| PDF                      |    2 | 동일한 7쪽 PDF의 중복 경로                        |
| SQL                      |    2 | 지원 artifact                                     |
| CSV / JSON / XML         | 각 1 | HTML AJAX 실습용 지원 artifact                    |
| `.text`                  |    1 | 빈 파일                                           |
| 확장자 없음              |    2 | 텍스트 메모 1개, 빈 파일 1개                      |
| 0바이트                  |   44 | post를 만들지 않음                                |
| 공백만 있는 파일         |   45 | 0바이트 44개와 줄바꿈 한 글자 파일 1개            |

모든 비-PDF 파일은 BOM 없는 UTF-8로 해석된다. 본문 문자열은 NFC이지만 macOS에서 만들어진 한글 경로는 NFD이며, 91개 경로가 NFC 표기와 다르다. 원본 경로와 원본 바이트는 그대로 보존하고 비교·표시·slug 계산에는 `sourcePathNfc`를 사용한다. 현재 자료에는 NFC/case-fold 전체 경로 충돌이 없다.

Markdown 50개만 파일 첫 줄부터 닫힌 `---` frontmatter를 가진다. 그중 49개가 파싱되고 `양식.md` 한 개는 `tags: [,]` 때문에 파싱에 실패한다. 주요 필드는 `layout` 50, `title` 50, `description` 50, `date` 48, `published` 48, `categories` 50, `tags` 40개다. 유효한 레코드에서 `published`는 true 39, false 8, 누락 2개지만, true 중 3개가 frontmatter만 있고 본문이 없다. 파싱 불가한 `양식.md`도 본문 없이 true를 선언한다.

원본에는 다음 경계가 있다.

- 날짜 접두사 `YYYY-MM-DD-` 41개, bare `YYYYMMDD` 8개.
- frontmatter와 파일명 날짜 충돌 8개, frontmatter 날짜 누락 2개.
- timezone 없는 시각 8개. 이 값은 `Asia/Seoul`로 명시적으로 해석한다.
- 파일명 앞 `ㅁ` 78개. 그중 true 6, false 1, frontmatter 없음 71개이므로 상태 판정에 사용하지 않는다.
- 정확히 같은 비어 있지 않은 파일 쌍 5개와 44개짜리 빈 바이트 중복 그룹.
- 30개 파일의 표준 fenced code block 139개는 모두 닫혀 있지만 언어 표시는 하나도 없다.
- 10개 Markdown에 fence 밖 HTML/XML/Java generic 표기가 있어 raw HTML을 실행하면 안 된다.
- 로컬 이미지 파일과 Markdown 이미지 문법은 없다.
- HTTP(S) 문자열 68개, localhost 참조 3개, 잘못된 `https://뿐만` 문장 1개가 있다.

## 현재 번들 정책

`content/seed/posts.json`의 기준 결과는 아래 숫자와 정확히 일치해야 한다.

| 상태                  | 개수 |
| --------------------- | ---: |
| 발견 (`discovered`)   |  195 |
| 가져옴 (`imported`)   |  121 |
| 공개 (`published`)    |   32 |
| 검토 (`review`)       |   80 |
| 명시적 초안 (`draft`) |    8 |
| 격리 (`quarantined`)  |    1 |
| 건너뜀 (`skipped`)    |   74 |

121개 중 format은 Markdown 112, 정적 추출 HTML 8, text 1개다. 74개를 건너뛴 상세 이유는 다음과 같다.

| 이유                                   | 개수 |
| -------------------------------------- | ---: |
| 빈 파일 또는 frontmatter만 있는 파일   |   48 |
| HTML에서 안전하게 렌더할 텍스트가 없음 |   19 |
| PDF 지원 artifact                      |    2 |
| SQL 지원 artifact                      |    2 |
| CSV 지원 artifact                      |    1 |
| JSON 지원 artifact                     |    1 |
| XML 지원 artifact                      |    1 |

상태 판정 순서는 다음과 같다.

1. `quarantinePaths`에 있으면 `quarantined`.
2. Markdown이 아니면 `review`.
3. frontmatter 파싱 실패, `reviewPaths`, redaction 발견, frontmatter 누락은 `review`.
4. `published: false`는 `draft`.
5. `published: true`는 `published`.
6. 그 외는 `review`.
7. 공백 본문, metadata-only, 지원 artifact, sanitization 뒤 텍스트가 없는 HTML은 post를 만들지 않고 `skipped` manifest에 남긴다.

명시적으로 true이고 본문이 있는 Markdown은 원래 36개지만, 자격증명 검토 정책 때문에 4개가 review로 내려가 최종 공개 글은 32개다. 날짜 충돌은 원본과 정규화된 날짜를 검토 사유로 남기되 현재 정책상 그 사실만으로 공개 상태를 내리지는 않는다.

## 경로, title, category, tag, slug

- `sourcePath`는 원본 NFD 경로이며 stable source identity다.
- `sourcePathNfc`는 NFC 비교·표시 경로다.
- title 우선순위는 비어 있지 않은 frontmatter title, 첫 Markdown H1, 정리한 파일명 순서다.
- frontmatter category가 있으면 폴더명보다 우선한다. `Design Pattern`은 policy에서 `DesignPattern`으로 alias한다.
- tag는 NFC로 바꾸고 공백을 정리하되 원본 철자를 임의로 번역하지 않는다. `Java/java`, `Servlet/servlet`, 오탈자는 운영자가 별도 병합한다.
- slug는 NFC title을 소문자로 바꾸고 한글·문자·숫자를 보존한다.
- 같은 base slug가 둘 이상이면 파일 순서에 의존하는 `-2`가 아니라 `--` 뒤에 `SHA-256(sourcePathNfc)` 앞 8자를 붙인다.
- 현재 suffix가 붙는 post는 6개이며 base collision은 `2022-09-08-목`, `web`, `자바-용어-정리` 세 그룹이다.
- source bytes가 그대로여도 policy, title/category/status, redaction, renderer 결과가 바뀌면 DB row를 갱신해야 한다. 완전히 같은 번들의 재실행만 no-op이어야 한다.

## 날짜 처리

날짜는 다음 우선순위를 사용한다.

1. 유효한 raw frontmatter `date`.
2. 파일명의 `YYYY-MM-DD` 접두사.
3. 파일명의 bare `YYYYMMDD`.
4. 없으면 `null`.

날짜만 있는 값은 서울 자정, timezone 없는 시각은 `Asia/Seoul` 현지 시각으로 해석한 뒤 ISO UTC 문자열로 저장한다. 파일 mtime은 `sourceUpdatedAt`과 재현 가능한 `generatedAt`에만 쓰며 편집자가 쓴 발행일을 대신하지 않는다. frontmatter와 파일명 날짜가 다르면 두 값을 보존하고 `date conflict`를 남긴다.

## Markdown과 HTML 안전 규칙

Markdown은 GFM으로 파싱한 뒤 sanitize한다. raw HTML은 기본적으로 escape하고 단독 `<br>`만 허용한다. Vue 예제의 `{{ ... }}`는 Liquid나 서버 템플릿으로 평가하지 않는다. code fence는 실행하지 않고 highlight 결과만 만든다. 링크는 `http`, `https`, `mailto`만 허용하며 외부 링크에는 `target="_blank" rel="noopener noreferrer"`를 붙인다.

독립 HTML은 블로그 DOM에서 실행하지 않는다. importer는 `script`, `style`, `noscript`, `iframe`, `object`, `embed`, `form`, `meta`, `link`를 제거하고 body의 안전한 정적 텍스트만 review 상태로 저장한다. sanitization 뒤 텍스트가 없으면 skip한다. 향후 인터랙티브 demo를 제공하려면 별도 origin, 인증 쿠키 없는 sandbox iframe, 제한 CSP를 새로 설계해야 한다.

PDF, SQL, CSV, JSON, XML은 현재 post entity가 아니라 지원 artifact다. 코드에 적힌 `store.js`, `Component.vue`, `cat1.jpg`, `detail.do` 같은 누락 참조를 맞추기 위해 빈 asset/post를 만들지 않는다.

## 민감정보와 회전 절차

`Web/ㅁ http vs https.md`에는 ngrok authtoken 형태의 값이 원본에 존재한다. 값 자체를 터미널, 문서, 테스트 실패 메시지, CI log, API에 출력하지 않는다. importer는 해당 span을 `[REDACTED BY IMPORTER]`로 치환하고 파일 전체를 `quarantined`로 둔다. 로컬 DB 자격증명과 예제 secret이 있는 다섯 경로는 `reviewPaths`에 있다.

회전 절차:

1. ngrok 계정의 token 관리 화면에서 노출된 token을 즉시 revoke하고 새 token을 발급한다. 오래되었거나 테스트용으로 보이더라도 폐기한다.
2. 새 token은 원본 글, repository, seed bundle에 넣지 않고 배포 환경 secret으로만 저장한다.
3. 원본 보관함을 직접 덮어쓰지 않는다. 공개할 글이 필요하면 승인된 redacted 편집본을 별도 관리한다.
4. 아래 명령으로 bundle을 재생성하고 카운트와 quarantine marker만 검사한다. token 원문으로 `grep`하지 않는다.
5. PostgreSQL seed를 다시 실행해 redacted content와 상태를 반영한다.
6. 과거에 외부로 공개된 적이 있다면 CI artifact, container image, reverse-proxy cache, browser/CDN cache, DB backup의 보존·폐기 정책도 점검한다.
7. review 승인 전에는 quarantined row를 published로 바꾸지 않는다.

redaction은 idempotent해야 한다. 같은 입력이나 이미 redacted된 bundle을 다시 처리해도 marker가 늘어나거나 손상되면 안 된다.

## 번들 재생성과 검증

workspace root에서 실행한다.

```bash
npm run content:bundle -- \
  --source /Users/cksmacbook/Desktop/Develop/Project/_posts \
  --policy content/import-policy.json \
  --output content/seed/posts.json
```

명령은 content 원문을 stdout에 쓰지 않고 output 경로와 count만 JSON으로 출력한다. 완료 후 비밀 값을 출력하지 않는 구조 검사로 기준선을 확인한다.

```bash
node - <<'NODE'
const bundle = require('./content/seed/posts.json')
const statuses = Object.create(null)
for (const post of bundle.posts) statuses[post.status] = (statuses[post.status] || 0) + 1
console.log({ counts: bundle.counts, statuses })
NODE
```

기대 결과:

```text
counts: discovered 195, imported 121, published 32, review 80, skipped 74
statuses: published 32, review 80, draft 8, quarantined 1
```

같은 원본과 policy로 bundle을 다시 만들면 `generatedAt`, post 순서, ID, slug, hash, 상태가 동일해야 한다. `generatedAt`은 실행 시각이 아니라 원본 중 가장 최신 mtime에서 만들어진다.

## PostgreSQL 적용과 테스트

서버 시작 시 migration과 seed를 실행하려면 다음 환경을 사용한다.

```bash
NODE_ENV=development \
BLOG_DATABASE_URL=postgresql://localhost/bonifacio_blog_dev \
BLOG_CONTENT_BUNDLE_PATH=content/seed/posts.json \
BLOG_AUTO_MIGRATE=true \
BLOG_SEED_ON_START=true \
npm run dev --workspace @bonifacio/blog-server
```

첫 seed는 121개 row를 반영하고, 같은 bundle의 두 번째 seed는 changed 0이어야 한다. policy나 renderer 결과가 바뀌면 source hash가 같더라도 달라진 row는 갱신되어야 한다.

통합 테스트는 기존 개발 DB를 재사용하거나 비우지 않는다. 각 실행마다 `bonifacio_test_<pid>_<random>` DB를 생성하고 suite 종료 시 연결을 종료한 뒤 명시적으로 drop하며, drop 여부도 확인한다. 기본값은 로컬 `postgresql://localhost/postgres`다. 다른 role/port를 쓰면 관리 DB URL을 지정한다.

```bash
BLOG_TEST_POSTGRES_ADMIN_URL=postgresql://localhost/postgres \
npm run test --workspace @bonifacio/blog-server
```

PostgreSQL이 없거나 role에 `CREATEDB`가 없을 때 통합 테스트는 조용히 skip하지 않고 실행 가능한 오류를 낸다. macOS Homebrew 설치라면 먼저 실제 설치된 버전의 service와 연결을 확인한다.

```bash
brew services list
pg_isready
psql -d postgres -X -c 'select current_database(), current_user'
```

검증 범위는 다음과 같다.

- migration 첫 실행 1개 적용, 두 번째 실행 0개.
- seed 첫 실행 121개 변경, 같은 bundle 재실행 0개.
- source bytes가 같은 metadata/policy 변경도 1개 갱신.
- DB 총 121, published 32, quarantined 1.
- 목록·상세·검색·category·meta API는 published row만 노출.
- review와 quarantined slug는 상세 API에서 404.
- quarantine content의 marker 존재와 token 형태 부재.
- 테스트 DB의 랜덤 이름과 명시적 삭제.
