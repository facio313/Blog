# 반응형 QA 기록

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
