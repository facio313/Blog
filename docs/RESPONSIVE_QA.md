# 반응형 QA 기록

## 카테고리 글자 크기 전환과 글 진입 상태 유지 — 2026-10-20 KST

- CategoryLinks의 링크 위치 이동과 이름의 크기 전환을 같은 0.55초 감속 곡선에 맞췄다. 이름은 커지며 올라가거나 작아지며 내려오고, 건수는 크기를 유지한 채 이동한다. CSS와 타일 모션은 변경하지 않았다.
- 활성 카테고리가 글 상세 API 응답 전까지 비워지는 현상을 수정했다. 목록·타일·관련 글·검색 링크가 알려진 카테고리를 라우터 state로 전달하며 상세 응답 후에는 서버 값을 따른다. 직접 주소 접근은 기존 API 조회로 카테고리를 결정한다.
- 코덱스 브라우저의 1280px에서 Homebrew→DesignPattern 선택 시 이름 높이가 46→47.35→49.05→56.77→66.22px로 커지고, ETC는 66.22→64.87→63.17→55.45→46px로 작아졌다. 홈에서도 Java 높이가 46→47.45→67.72→80.68→110.39px로 변화했다.
- DesignPattern 목록→Front Controller 전환 중 10개 표본과 완료 상태 모두 DesignPattern이 활성 항목이며 이름 높이 66.22px를 유지했다. 아래 메뉴로 내려가는 중간 상태가 없었다.
- 390px에서 Java→DesignPattern 변경 시 새 이름 높이가 39→42.58→44.12→47.56→51.52px로 커지고, 이전 이름은 51.52→47.94→46.39→42.96→39px로 작아졌다. 문서 가로 넘침은 0px, console error/warn 0. 브라우저 자동화의 링크 클릭은 클릭 대상을 화면 중앙에 맞출 수 있으므로 이번 모션 측정의 클릭 직전/직후 스크롤 차이를 앱 동작으로 해석하지 않는다.
- 상세 응답을 지연하는 회귀 테스트를 추가해 글 진입 직후·로딩 중·응답 후 같은 카테고리 링크가 계속 윗줄에 있는지 검증한다. 최종 Vitest 18개, TypeScript/Vite 빌드, 변경 TSX ESLint·Prettier 통과.
- 결과: `output/playwright/category-scale-{article,mobile}.jpg`, `category-scale-checks.json`. 미리보기 서버는 유지하고 검증 탭과 임시 화면 크기는 정리했다.

## 카테고리 모션 통일과 자동 화면 이동 제거 — 2026-10-20 KST

- 홈·읽기 화면이 같은 CategoryLinks의 2행 배치와 0.55초 위치 애니메이션을 사용한다. All notes에서는 `collection.`이 보이고, 다른 분류를 선택하면 같은 링크가 원래 메뉴 자리에서 위로 올라간다. 이전 선택은 아랫줄로 복귀한다. 홈의 별도 분류 제목을 제거했으며 모바일 전체 메뉴의 세로 배치는 유지한다.
- 카테고리·All notes 링크에서 자동 세로·가로 스크롤을 제거했다. 로딩 중에는 직전 결과 영역 높이를 유지한다. 홈의 소개는 필터링 중 펼친 채 유지하고 게시글→카테고리 목록에서는 접힌 채 유지한다. 명시적인 read/explore 앵커, 일반 글 진입과 키보드 포커스 복원은 유지한다. 아래 과거 기록의 홈 메뉴 고정 배치·All notes 상단 이동·분류 선택 시 스크롤은 이번 요구사항으로 대체한다.
- 코덱스 브라우저의 데스크톱에서 카테고리 변경과 All notes 복귀 전후 scrollY=797을 유지했다. All notes에서는 `collection.`이 다시 보인다.
- 390px에서 화면 좌표로 DesignPattern을 클릭하여 자동화 도구의 링크 중앙 맞춤을 배제했다. 선택 항목은 원래 메뉴 위치에서 위로 움직이며 중간 표본 `(100.65, 167.85)` → `(74.72, 153.41)`과 최종 x=20px를 확인했다. 전환 중·후 scrollY=697을 유지했다. Front Controller에서 Git을 실제 클릭하면 `/notes?category=Git`의 타일로 이동하며 scrollY=0과 소개 접힘을 유지한다.
- 320px에서 DesignPattern의 폭은 260.08px로 280px 메뉴 안에 들어간다. 320/390px 모두 보기 전환 버튼과 선택 제목이 화면 안에 있고 문서 가로 넘침은 0px이다.
- 최종 Vitest 17개, TypeScript/Vite 빌드, 변경 소스 ESLint·Prettier 통과. 브라우저 console error/warn 0. 타일 CSS 40개 블록과 PostList 마크업·모션은 이번 수정 전과 동일하다.
- 결과: `output/playwright/unified-category-{home,mobile}.jpg`, `unified-category-checks.json`. `mobileNative*`가 실제 좌표 클릭 측정이며, 앞선 `mobileBefore` 등은 자동화 도구의 링크 중앙 맞춤이 섞인 탐색 기록이다.

## 활성 카테고리 올림과 제목 끝부분 노출 — 2026-10-20 KST

- 게시글·읽기 목록의 선택한 카테고리를 별도 윗줄에 배치한다. 링크를 복제하지 않고 같은 DOM을 이동하며, 다른 분류 선택 시 새 항목은 위로 올라가고 이전 항목은 아래 메뉴로 내려온다. 홈의 배열과 필터링 동작은 유지한다.
- 코덱스 브라우저에서 Java → DesignPattern → Git 전환을 확인했다. Git의 중간 좌표는 `(649.47, 579.56)` → `(494.29, 531.86)`으로 움직이고 최종 위치는 `(445.5, 516.86)`이다. 전환 시간은 0.55초이며 동작 줄이기에서는 위치 애니메이션을 생략한다.
- `notes. → in motion` 순서와 기존 슬라이드는 유지하며 왼쪽에 `s`의 절반과 점이 남도록 이동 거리를 계산한다. 2267px에서 `s` 폭 113.16px 중 56.92px가 보이며 `in motion` 전체가 화면 안에 있다.
- 390px와 320px에서 긴 DesignPattern의 폭은 268.81px로 메뉴 안에 들어간다. 320px에서 메뉴를 가로로 넘겨 Java를 선택한 뒤에도 윗줄은 x=20px에 유지된다. 두 너비 모두 문서 가로 넘침 0px이고 주제목 전체가 보인다.
- Vitest 17개, TypeScript/Vite 빌드, 변경 TSX ESLint·Prettier 통과. 기존 제목 슬라이드 테스트에 끝 글자 측정과 부분 노출을 반영했다. 브라우저 console error/warn 0. 타일 CSS 40개 블록과 PostList 마크업·모션은 수정 전과 동일하다.
- 결과: `output/playwright/category-lift-{desktop,mobile}.jpg`, `category-lift-checks.json`. 아래 제목을 완전히 화면 밖으로 보내던 과거 기록은 이번 부분 노출 방식으로 대체한다.

## 홈 카테고리의 소개 영역 유지 — 2026-10-20 KST

- 후속 요청에 따라 홈 카테고리는 홈에서 필터링하고 소개 영역을 펼친 채 유지한다. 게시글에 들어간 뒤 카테고리를 탐색할 때만 읽기 화면의 접힘 상태를 유지한다. 아래 접힘·펼침 기록의 홈 카테고리 동작은 이 수정으로 대체한다.
- 코덱스 브라우저에서 홈 → DesignPattern 선택 후 `notes.`와 소개 높이 530.91px 유지, Front Controller 진입 후 높이 0px, 이어서 Java 카테고리 선택 후에도 높이 0px를 확인했다.
- Vitest 17개, TypeScript 검사, 변경 TSX ESLint·포맷 검사 통과. 기존 필터링 테스트에 홈 경로, 소개 DOM 유지 및 펼침 상태를 확인하는 검증을 반영했다. 애니메이션·타일 CSS 변경은 없다.

## 홈 소개 영역 접힘·펼침 — 2026-10-20 KST

- HomeIntro를 공통 제목 아래에 유지하고 높이와 세로 위치를 0.72초 동안 전환한다. 글·카테고리를 열면 위로 접히고 All notes는 홈 상단으로 돌아와 아래로 펼친다. 아래 All notes 앵커 직행 기록은 이번 후속 요청으로 대체한다.
- 코덱스 브라우저의 1440px 화면에서 소개 영역 높이 491.95px→0, 세로 이동 0→-491.95px를 확인했다. 중간 표본도 높이 89.97→38.83px와 세로 이동 -401.98→-453.12px로 연속 변화한다. 복귀 표본은 높이 445.06→480.45px, 세로 이동 -46.89→-11.50px였으며 화면 상단을 유지했다.
- 390px에서 Java 목록 → 모바일 Index → All notes 후 목록 보기와 상단 위치를 유지했다. 접힌 높이는 0, 펼친 높이는 517.13px이다. 320px에서도 펼친 높이 544.13px와 글 진입 후 0px를 확인했다. 두 너비의 가로 넘침은 0px이다.
- Vitest 17개, TypeScript/Vite 빌드, 변경 TSX ESLint 및 포맷 검사 통과. 회귀 테스트는 같은 소개 DOM의 재사용, 숨김·inert 상태, 접힘/펼침 완료와 목록 보기 유지를 확인한다. 타일 CSS 40개 블록과 PostList는 수정 전과 동일하다.
- 결과: `output/playwright/hero-slide-opening.jpg`, `hero-slide-mobile-{open,closed}.jpg`, `hero-slide-home.jpg`, `hero-slide-checks.json`.

## All notes의 홈 Index 이동 — 2026-10-20 KST

- 후속 요청에 따라 All notes만 `/#post-index`로 이동하도록 변경했다. 선택한 목록/타일 보기를 유지하고 카테고리 필터를 제거한다. 다른 카테고리는 읽기 화면에서 계속 연다.
- 코덱스 브라우저에서 Front Controller → DesignPattern 6개 타일 → All notes → 홈 전체 32개 타일을 확인했다. 화면 전환 전에 실행되던 스크롤을 홈 목록 로딩 완료 시에도 맞춰 Index 시작점으로 이동하게 했다.
- Vitest 17개, TypeScript/Vite 빌드, 변경 TSX ESLint 통과. 기존 회귀 테스트에 All notes의 홈 경로, 목록 보기 유지, 새 홈 Index 요소의 스크롤 호출을 추가했다.

## 읽기 화면 안에서 카테고리 탐색 — 2026-10-20 KST

- 글에서 카테고리·All notes·Index를 누르면 `/blog/notes`에서 타일/목록을 표시한다. 홈의 소개 영역은 표시하지 않고 공통 제목과 카테고리 메뉴는 DOM을 유지한다. 기본은 타일이며 선택한 보기 방식은 글 링크와 카테고리 링크에도 전달한다.
- 코덱스 브라우저에서 Front Controller → Git 메뉴 선택 후 8개 타일을 확인했다. 1440px에서 전환 전후 제목 이동값은 -646px, 메뉴 상단은 490.234375px로 동일하다. 목록 전환 → DesignPattern 6개 → Front Controller 열기 → 뒤로 가기 → 새로고침 후에도 분류와 목록 보기가 유지된다.
- 모바일 메뉴에서 Java를 고르면 같은 읽기 화면에 글 12개가 표시된다. 390px 목록/타일을 직접 확인하고 저장했다. 320px에서 문서 가로 넘침 0px, 보기 전환 버튼이 화면 안에 있다. 최종 console error/warn 0. 브라우저 크기를 복원하고 DesignPattern 타일 보기를 열어두었다.
- 최종 Vitest 17개, TypeScript/Vite 빌드, 변경 TSX ESLint 및 포맷 검사 통과. 기존 테스트 하나는 글 링크에 `view=list`를 보존하는 새 동작에 맞춰 예상 주소를 수정했다. 새 테스트는 글↔분류 목록 전환에서 제목/메뉴 DOM 유지, 기본 타일, 보기 유지 및 직접 주소 접근을 확인한다.
- 타일 CSS 40개 블록은 동일하다. PostList의 변경은 선택한 보기 방식을 링크에 추가하는 부분뿐이며 타일 마크업/모션은 유지했다. Nginx의 기존 `/blog/` SPA fallback이 새 경로도 처리함을 소스에서 확인했다.
- 결과: `output/playwright/reading-collection-{tiles,list}.jpg`, `reading-collection-mobile-{tiles,list}.jpg`. 로컬 서버는 유지하며 커밋·푸시·배포는 하지 않았다.

## 순서를 유지하는 SPA 제목 슬라이드 — 2026-10-20 KST

- 사용자 정정에 따라 `notes. → in motion` 순서를 고정했다. 공통 제목과 SiteChrome은 페이지 전환 밖에 남기고 본문만 교체한다. 글 진입 시 제목 줄이 왼쪽으로, 홈 복귀 시 오른쪽으로 이동한다. 아래 주제목·메뉴 계층 조정 기록의 문구 순서 교체는 이 구현으로 대체한다.
- 코덱스 내장 브라우저에서 홈 타일 → Front Controller 진입 중 가로 이동값 0 → 약 -646px, 뒤로 가기 중 약 -646px → 0을 관찰했다. 중간 위치와 색상도 연속적으로 변하며 모든 표본의 문구 순서는 동일하다. 브라우저 앞으로 가기와 글 직접 새로고침도 확인했다.
- 320/390/768/1440px에서 `in motion` 전체가 보이고 `notes.`는 왼쪽 밖에 있다. 페이지 가로 넘침은 0px이다. 화면 크기에 맞춰 이동 거리를 다시 측정한다. 개발 중 span 타입 교체 후 핫 리로드 상태에서 첫 리사이즈의 이동값이 0이 되는 현상이 한 번 있었으며, 새로고침 후 위 네 너비를 다시 확인한 결과 정상이다.
- 새 회귀 테스트는 홈 → 글 → 홈 사이에 동일한 제목 DOM과 문구 순서를 유지하고 이동값이 복귀하는지, 공통 모바일 메뉴에서 글의 분류가 선택되는지를 확인한다. 최종 Vitest 15개, TypeScript/Vite 빌드, 변경 TSX ESLint 통과. 최종 브라우저 console error/warn 0.
- 기존 타일 CSS 40개 블록과 PostList 마크업·모션은 변경하지 않았다. 결과는 `output/playwright/panorama-slide-{desktop,mobile}.jpg`, `panorama-slide-checks.json`. 브라우저 크기를 복원하고 Front Controller 글을 열어두었으며 로컬 서버는 유지한다.

## 게시글 주제목·메뉴 계층 조정 — 2026-10-20 KST

- 사용자 후속 코멘트에 맞춰 게시글은 `in motion → 카테고리 메뉴 → 글 제목` 순서로 변경했다. `notes.`는 오른쪽 보조 문구로 옮기고 독립된 분류 부제목을 제거했다. 홈 제목과 타일은 유지한다.
- 코덱스 내장 브라우저에서 `Decorating Filter`를 320/390/768/1440px로 확인했다. 모든 너비에서 주제목 전체가 보이고 문서 가로 넘침은 0px이며, 메뉴가 글 제목 위에 있다. 글 제목과 선택 메뉴의 실제 색은 모두 `rgb(255, 128, 102)`이다. 모바일/데스크톱 화면을 직접 확인하고 저장했다.
- 카테고리 메뉴의 `DesignPattern`을 누르면 타일 기본 보기로 글 6개가 표시되고, 타일을 눌러 글 상세로 돌아온다. 홈의 주제목은 `notes.`로 유지된다. 타일 CSS 40개 블록과 PostList 마크업·모션은 수정 전과 동일하다.
- 프런트엔드 테스트 14개, TypeScript/Vite 빌드, 변경 TSX의 ESLint 통과. 브라우저 console error 0. 아래 공통 제목 유지 기록은 이번 조정 전 단계의 검증이다.
- 결과: `output/playwright/article-motion-primary-{desktop,mobile}.jpg`, `article-motion-primary-checks.json`. 브라우저 크기를 복원하고 해당 게시글을 열어두었다. 로컬 API/Vite 서버는 유지한다.

## 게시글 공통 제목 유지 — 2026-10-20 KST

- 홈의 `notes. in motion`을 `PanoramaHeading`으로 공유하여 게시글 로딩/완료/실패 상태에도 표시한다. 로딩에서 완료로 바뀔 때 공통 제목 DOM이 유지되는지 기존 글 상세 테스트에서 확인했다.
- `Front Controller` 글을 코덱스 내장 브라우저에서 열어 `notes. in motion → DesignPattern → Front Controller` 순서를 확인했다. 320/768/1440px에서 주요 제목·분류·글 제목이 화면 안에 있고 문서 가로 넘침은 0px이다. 390×844 화면도 직접 확인하고 저장했다. 보조 `in motion`의 가장자리 잘림은 홈과 같은 의도된 표현이다.
- `DesignPattern` 부제목 링크로 해당 분류의 타일 6개가 표시되는 것을 확인했다. 타일 전용 CSS 40개 블록과 PostList 마크업·모션은 이번 수정 전과 동일하다.
- 프런트엔드 테스트 14개, TypeScript/Vite 빌드, 변경 TSX의 ESLint 통과. 브라우저 console error 0. 스크린샷은 `output/playwright/article-shared-title-{desktop,mobile}.jpg`, 측정은 `article-shared-title-checks.json`이다.

## 현재 디자인 보강 검증 — 2026-10-20 KST

사용자 피드백에 따라 타일을 기본값으로 바꾸고 활자 중심 영역의 Zune HD 느낌을 강화했다. 아래 검증은 코덱스 내장 브라우저와 동일한 읽기 전용 임시 API로 수행했다.

- 홈은 320×568, 390×844, 768×1024, 1440×1000에서 문서 가로 넘침 0px, 주요 제목·세로 메뉴가 화면 안에 표시됨, 기본 타일 32개를 확인했다. 제목 옆 `in motion`과 검색의 `your notes`는 의도적으로 일부만 보이는 장식 문구다.
- 글 상세는 320×568, 768×1024, 1440×1000에서 제목이 화면 안에 표시되고 가로 넘침이 없었다.
- 기본 타일 → 목록 선택 → Java 분류 → 새로고침 → 타일 복귀를 확인했다. `view=list`는 유지되고 타일로 돌아오면 불필요한 view 파라미터가 제거된다. `/blog/` 기준으로 홈 링크를 생성해 새로고침 시 Vite 기본 경로 안내 화면이 뜨지 않도록 수정했다.
- 390px에서 세로 메뉴의 검색 진입, Java 검색 15개 결과와 Escape 종료, 모바일 Index에서 Java 선택 후 타일 12개 및 활성 분류가 가로 탐색 영역에 표시되는 것을 확인했다.
- 기존 타일 전용 CSS 40개 블록과 PostList의 마크업·모션은 변경 전과 동일하다. 공통 목록 hover 색상만 `.post-rows`로 제한하여 코럴 타일 제목이 사라지던 문제를 수정했다. 타일의 기존 화살표 이동도 유지했다. 키보드 포커스 상태에서 제목은 `rgb(17, 17, 16)`, 배경은 `rgb(255, 128, 102)`로 확인했다.
- 키보드 검색 종료 시 고정 460ms 타이머가 실제 회전 종료보다 먼저 실행되어 포커스가 body에 남는 문제를 재현했다. 검색과 모바일 Index 모두 `onExitComplete` 다음 프레임에 포커스를 복원하도록 수정하고, 코덱스 브라우저에서 원래 검색 버튼/Index 버튼으로의 복귀를 확인했다.
- 최종 프런트엔드 Vitest 14개, TypeScript/Vite 빌드, 변경 TSX의 ESLint 통과. 기존 동작 줄이기 처리와 CSS 계약 테스트를 유지했다. 브라우저 console error 0.

이번 화면과 측정 기록은 로컬 `output/playwright/zune-stronger-*.jpg`, `zune-refinement-checks.json`에 저장했다. 폴더 이름과 관계없이 이번 브라우저 검증은 모두 코덱스 내장 브라우저에서 수행했다.

## 최초 디자인 전환 검증 — 2026-10-20 KST

Zune HD / Windows 10 Mobile에서 출발한 `notes in motion` 디자인을 Chromium 실제 브라우저에서 확인했다. 운영 DB를 사용하지 않고, 저장소 seed 중 `published`인 32개 글만 반환하는 읽기 전용 임시 API로 화면을 검증했다. PostgreSQL 검색·서버 통합 테스트의 재실행을 뜻하지 않는다.

- 홈 목록/타일 각각 **11개 viewport × 32개 글**, 총 704개 행을 측정했다: 320×568, 390×844, 600×960, 768×1024, 844×390, 900×800, 901×800, 1100×800, 1101×800, 1440×1000, 2560×1440.
- 모든 조합에서 문서 가로 넘침 0px, 글 행 내부 넘침 없음, 표시 중인 번호·분류·제목·날짜·화살표의 행 경계 이탈 없음, 홈 대형 제목 잘림 없음. 브라우저 resize 직후의 과도 상태는 CSS gutter가 새 viewport에 맞게 계산된 뒤 측정했다.
- 타일은 1101px 이상 4열, 901~1100px 3열, 900px 이하 2열이며, 넓은 글 타일을 섞는다. 최대 콘텐츠 폭은 86rem이다. 600px 이하 홈은 한 열로 정리된다.
- `/` 검색 → `Java` 입력 → 공개 fixture 결과 15개 → Escape를 확인했다. 입력창 포커스 및 원래 타일 버튼으로의 포커스 복귀, 읽던 위치 603px 유지도 확인했다.
- 모바일 Index는 검색과 중복으로 열리지 않으며 844×390에서 헤더/닫기 버튼을 유지한 채 9개 분류 링크 영역이 스크롤된다.
- 모바일 Index에서 Java를 선택하면 타일 보기와 `#post-index`를 유지하고 12개 글을 표시한다. 메뉴가 닫힌 뒤 목록 시작점으로 이동하며 버튼 포커스 복귀로 페이지가 다시 맨 위로 움직이지 않는다.
- `MVC pattern` 글에서 모바일 목차 13개, 코드 블록 7개, `#view` 이동, 제목 메타데이터, 문서 가로 넘침 0px을 확인했다. 데스크톱/모바일 본문 화면을 직접 확인했다.
- 동작 줄이기에서 홈/타일 transform이 `none`이고 모든 타일이 보인다. CSS animation/transition의 지연도 제거하여 첫 진입 파형이 대기 상태로 남지 않게 했다.
- 새 보기 전환의 URL 보존과 분류 변경 스크롤을 포함한 프런트엔드 테스트 **12개 통과**. TypeScript/Vite 빌드와 프런트엔드 ESLint, 수정한 소스의 Prettier 검사도 통과했다. 최종 결과는 `docs/ai/CURRENT.md`에 기록한다.

스크린샷과 브라우저 측정 출력은 로컬 `output/playwright/`에 보관한다(버전 관리 제외). 대표 파일은 `desktop-home.png`, `desktop-tiles.png`, `mobile-home.png`, `mobile-tiles.png`, `desktop-article.png`, `mobile-article.png`, `responsive-measurements.txt`, `category-scroll-result.txt`, 실제 전환을 녹화한 `design-motion.webm`이다.

## 이전 디자인 검증 — 2026-08-24 KST

아래 내용은 이전 rail/종이색 디자인에 대한 당시 검증 기록이며, 현재 레이아웃 계약은 위 절을 따른다.

이 문서는 Bonifacio Notes의 반응형 지원 범위, 실제 브라우저 측정 결과, 그리고 이후 변경에서 지켜야 할 계약을 기록한다. 단순히 문서 전체에 가로 스크롤바가 없는지만 보지 않는다. `overflow: hidden` 안에서 내용이 잘리는 경우를 잡기 위해 각 글 행과 그 자식의 실제 사각형도 함께 측정한다.

검증일은 2026-08-24 KST다. 지원 하한은 320 CSS px이며 280px은 방어 동작을 확인하기 위한 추가 탐색값이다.

## 구현 계약

- 900px 이하는 rail을 상단 wordmark/Index bar로 바꾸고 전체를 단일 컬럼으로 만든다.
- 901px 이상 rail은 `clamp(16rem, 38vw, 38rem)`으로 연속적으로 변한다.
- 1230px 이하 글 행은 compact 5열을 사용하고 read-time을 접는다. 1231px부터만 전체 6열을 사용한다.
- 글 목록과 검색 결과의 최대 canvas는 112rem(1792px)이다.
- 본문을 포함한 일반 텍스트는 줄바꿈하지만 `pre`와 `table`만 자신의 영역 안에서 가로 스크롤한다.
- 점으로 이어진 긴 식별자형 제목은 임의의 마지막 글자에서 끊지 않고 의미 있는 구두점에 `<wbr>` 기회를 둔다.
- 모바일 목차는 닫힌 native `details`로 시작한다. 24개처럼 긴 목차는 최대 `min(55svh, 28rem)` 안에서 독립적으로 스크롤한다.
- 목차가 두 항목보다 적으면 mobile에서 빈 aside나 divider가 공간을 차지하지 않는다.
- Search와 mobile Index는 `100dvh` shell 안에서 header/footer를 유지하고 결과/nav만 스크롤한다.
- 모든 전체 화면 surface는 safe-area inset을 padding에 합산한다. viewport meta는 `viewport-fit=cover`를 사용한다.
- 모바일 Search와 modal close는 44×44px 이상이며 icon-only Search에는 `aria-label="검색 열기"`가 있다.
- modal을 닫으면 exit animation 뒤 원래 Search/Index trigger로 focus가 돌아간다.
- 현재 category는 색상뿐 아니라 `aria-current="page"`로도 전달한다.
- light surface의 focus ring은 검정을, dark surface의 focus ring은 acid를 사용한다.
- `prefers-reduced-motion: reduce`에서는 animation과 transition을 사실상 제거한다.

## 홈 화면 viewport 측정

아래 26개 viewport에서 공개 글 32개 전체, 총 832개 행을 검사했다.

| 분류              | viewport                                                   |
| ----------------- | ---------------------------------------------------------- |
| 최소·일반 mobile  | 280×653, 320×568, 360×640, 390×844, 430×932                |
| tablet            | 600×960, 768×1024, 769×1024, 770×1024, 834×1112            |
| 낮은 landscape    | 844×390, 901×600, 1024×600                                 |
| mode 경계         | 899×800, 900×800, 901×600                                  |
| compact row 경계  | 1080×720, 1081×720, 1200×800, 1229×800, 1230×800, 1231×800 |
| desktop·ultrawide | 1280×720, 1440×900, 1920×1080, 2560×1440, 3840×2160        |

각 viewport에서 다음을 모두 만족했다.

- `documentElement.scrollWidth - clientWidth = 0`
- 모든 `.post-row`의 `scrollWidth - clientWidth = 0`
- 현재 표시 중인 number/category/title/date/time/arrow가 각 row 사각형 안에 존재
- 900px 이하에서 mobile Index trigger만 보이고, 901px 이상에서 rail category가 보임
- 낮은 desktop에서 rail의 `scrollHeight = clientHeight`; footer가 viewport 안에 존재
- 2560px과 3840px에서 글 목록 폭은 1792px 상한을 유지

## 공개 글 전수 측정

PostgreSQL에서 공개되는 32개 글을 다음 6개 viewport에서 모두 열었다.

- 320×568
- 390×844
- 844×390
- 901×600
- 1280×720
- 2560×1440

총 192개 글/viewport 조합에서 다음 failure가 0개였다.

- 문서 가로 overflow
- article title 내부 overflow
- description 내부 overflow
- `pre`가 article content 사각형 밖으로 이탈

실제 최장 제목 `System.in, System.out.println()`은 320px에서 `System.in,` / `System.out.` / `println()`의 세 의미 단위로 나뉘며 title의 `scrollWidth`와 `clientWidth`가 같다.

실제 `Builder` 글의 code block 10개도 별도로 확인했다. 280/320/390/768/1280px에서 긴 code는 필요할 때 `pre` 안에서만 스크롤됐고, 문서나 article content 밖으로 나간 block은 0개였다.

## 목차·검색·모바일 인덱스

### 목차

- `/posts/command`의 빈 `.article-aside.empty`는 320px에서 `display:none`, 0×0 사각형이며 예전의 97px 빈 공간과 divider가 사라졌다.
- `/posts/design-pattern`의 24개 목차는 mobile에서 처음 54px 높이의 닫힌 disclosure다.
- 펼치면 목록의 `clientHeight`는 312px, `scrollHeight`는 1068px, `overflow-y:auto`다.
- 1280px에서는 desktop sticky aside 24개가 보이고 mobile disclosure는 `display:none`이다.

### Search

- 320×568에서 trigger는 이름 `검색 열기`, 크기 44×44px다.
- dialog와 panel은 정확히 568px 높이다.
- 결과 영역은 `clientHeight 475px / scrollHeight 604px`이며 그 영역만 스크롤한다.
- 결과를 끝까지 스크롤해도 close button은 `top 16px / bottom 60px`에 남는다.
- 844×390에서도 dialog는 844×390, 결과 영역은 `281px / 612px`, close button은 44×44px로 viewport 안에 남는다.

### Mobile Index

- 320×568에서 dialog 자체는 568px로 고정되고 nav만 `446px / 503px` 범위에서 스크롤한다.
- 844×390에서는 nav가 `251px / 479px` 범위에서 스크롤한다.
- 두 화면 모두 close는 44×44px이며 header와 footer는 nav scroll 전후 같은 위치에 남는다.
- Search/Index가 중첩 modal로 동시에 열리지 않으며 닫힌 뒤 trigger focus와 `aria-expanded=false`가 복구된다.

## 대비와 focus

작은 텍스트는 WCAG 4.5:1, focus indicator는 인접 배경 3:1을 하한으로 삼았다.

| 용도                      | 전경 / 배경           |    대비 |
| ------------------------- | --------------------- | ------: |
| category count            | `#8c8c87` / `#090909` |  5.89:1 |
| rail footer               | `#83837d` / `#090909` |  5.22:1 |
| post index / section meta | `#686863` / `#f6f4ee` |  5.09:1 |
| TOC counter·mobile meta   | `#666660` / `#f6f4ee` |  5.25:1 |
| lilac eyebrow             | `#67566b` / `#f6cdff` |  4.84:1 |
| dark focus ring           | `#dfff4f` / `#090909` | 17.59:1 |
| light focus ring          | `#090909` / `#f6f4ee` | 18.10:1 |
| lilac focus ring          | `#090909` / `#f6cdff` | 14.31:1 |

실제 브라우저 console에는 application warning/error가 없었다. Vite 연결 debug와 React DevTools 개발 안내만 있었다.

## 자동 회귀 검사

`apps/web/src/responsive.test.ts`는 jsdom이 픽셀 layout을 계산할 수 없다는 한계를 숨기지 않고 다음 소스 계약을 검사한다.

- fluid rail, 112rem canvas, 900/901과 1230/1231 breakpoint
- 네 방향 safe-area와 `viewport-fit=cover`
- 긴 제목/목록 제목 wrap
- code/table local overflow
- Search/Index의 고정 shell + 내부 scroll 구조
- 짧은 높이와 reduced-motion mode

`apps/web/src/App.test.tsx`는 다음 의미·상태 계약을 검사한다.

- icon-only Search의 accessible name과 dialog 종료 후 focus 복귀
- category의 `aria-current`
- desktop/mobile TOC link와 닫힌 disclosure
- no-TOC 글에서 mobile disclosure 미렌더링
- code/table stress fixture
- mobile Index의 `aria-expanded`, modal 중첩 방지, focus 복귀

실제 CSS geometry는 jsdom test 결과로 주장하지 않는다. layout·font·native dialog를 바꾸는 수정에서는 이 문서의 browser matrix를 다시 실행하고, 최소한 320, 390, 844×390, 900/901, 1080/1081, 1230/1231, 1440, 2560px을 시각 검수한다.
