# Bonifacio Blog — freesourc.es 디자인 리서치

> 조사일: 2026-08-23~24 (KST)<br>
> 조사 대상: [freesourc.es](https://freesourc.es/)와 화면에서 직접 도달 가능한 모든 내부 카테고리·정보·모바일 메뉴 페이지<br>
> 목적: freesourc.es의 디자인 원리를 근거 있게 이해하고, 이를 Bonifacio Blog의 홈·목록·글 상세·검색·모바일 경험으로 독자적으로 변형한다.

## 1. 이 문서를 읽는 법

이 문서는 레퍼런스에서 실제로 확인한 사실과 Bonifacio에 적용할 제안을 의도적으로 분리한다.

- **관찰(Observed)**: 실제 페이지, DOM, 계산된 CSS, 스크린샷 또는 브라우저 상호작용으로 확인한 현재 상태다.
- **해석(Inference)**: 관찰된 패턴이 왜 효과적인지에 대한 디자인 해석이다.
- **변형(Adaptation)**: Bonifacio Blog를 위해 새로 설계해야 할 독자적인 UI·모션·접근성 사양이다.
- **금지(Avoid)**: 레퍼런스의 약점을 복제하거나, 레퍼런스 자산·문구를 모방하지 않기 위한 경계다.

레퍼런스의 텍스트, 아이콘 글리프, 브랜드 표현, 외부 리소스 자산은 복사 대상이 아니다. 이 문서가 가져오는 것은 비대칭 레이아웃, 타이포그래피 중심 인덱스, 제한된 색상, 고정 내비게이션, 화면 단위 색상 전환 같은 **일반적인 디자인 원리**다.

## 2. 조사 범위와 증거

### 2.1 확인한 공개 페이지

홈과 각 페이지의 실제 내부 내비게이션에서 발견한 경로를 기준으로 조사했다. URL 변형을 추측해서 페이지 수를 부풀리지 않았다.

| 페이지               | URL                                                                                | 확인한 내부 섹션                                     | 조사 시점 외부 링크 수 |
| -------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------: |
| Home                 | [https://freesourc.es/](https://freesourc.es/)                                     | Design 인덱스와 동일한 주요 콘텐츠                   |                    185 |
| Design               | [https://freesourc.es/Design](https://freesourc.es/Design)                         | Inspiration, Education/Reading/Guides, Assets, Tools |                    185 |
| Typography           | [https://freesourc.es/Typography](https://freesourc.es/Typography)                 | Fonts, Education/Reading/Guides, Tools               |                    149 |
| Photography          | [https://freesourc.es/Photography](https://freesourc.es/Photography)               | Stock & Public Domain, Tools                         |                     59 |
| Color                | [https://freesourc.es/Color](https://freesourc.es/Color)                           | Inspiration, Tools                                   |                     19 |
| Icons & Illustration | [https://freesourc.es/Icons-Illustration](https://freesourc.es/Icons-Illustration) | Icons, Illustration                                  |                     35 |
| Development          | [https://freesourc.es/Development](https://freesourc.es/Development)               | Inspiration, Education/Reading/Guides, Tools         |                     67 |
| Motion               | [https://freesourc.es/Motion](https://freesourc.es/Motion)                         | Inspiration, Stock & Public Domain, Tools            |                     39 |
| Miscellaneous        | [https://freesourc.es/Miscellaneous](https://freesourc.es/Miscellaneous)           | Miscellaneous Tools                                  |                     40 |
| Info                 | [https://freesourc.es/Info](https://freesourc.es/Info)                             | 전체 화면 소개·기여 안내                             |              해당 없음 |
| Mobile Menu          | [https://freesourc.es/Mobile-Menu](https://freesourc.es/Mobile-Menu)               | 전체 화면 카테고리 메뉴                              |              해당 없음 |

외부 링크 수는 사이트의 영구 규격이 아니라 조사 시점의 콘텐츠 밀도를 보여 주는 참고값이다.

### 2.2 확인 방법

**관찰**

- 1280×720 데스크톱 화면에서 모든 내부 페이지의 시각 구조, 스크롤 높이, 고정 레이어, 링크·제목 계층을 확인했다.
- 390×844 모바일 화면에서 홈, 전체 화면 메뉴, Info 화면을 확인했다.
- 390, 600, 767, 768, 769, 770, 800, 900, 1024, 1280px 폭을 비교해 반응형 전환 경계를 좁혔다.
- DOM snapshot과 계산된 CSS를 함께 사용해 글꼴 크기, 행간, 색, 패딩, 컬럼 폭, position, transition duration을 측정했다.
- 실제 마우스 hover, 페이지 내 anchor 이동, 모바일 메뉴 이동을 확인했다.
- 자동화 도구가 화면에 표시하는 표식은 사이트 자체 효과에서 제외했다. 특히 화면을 검게 덮고 hover 대상만 남기는 것처럼 보이는 표식은 freesourc.es 고유 모션이 아니다.

## 3. 관찰: 정보 구조

### 3.1 사이트는 갤러리가 아니라 편집된 인덱스다

**관찰**

- 모든 카테고리 페이지가 동일한 좌측 계층 내비게이션과 우측 텍스트 목록 문법을 공유한다.
- 조사한 카테고리 페이지의 콘텐츠 이미지 수는 0이었다. SVG는 플랫폼 아이콘·마커 용도였고 실제 리소스 썸네일이 아니었다.
- 카드, 검색 입력, 필터, 정렬 컨트롤, 폼이 없다.
- 한 줄에 한 링크를 배치하고, 수평선·작은 분류명·큰 공백으로 수백 개 링크를 조직한다.
- 홈 / 는 Design 페이지의 인덱스를 사실상 첫 화면으로 사용한다.

**해석**

이 구조는 링크를 검색 결과가 아니라 편집자의 목차처럼 보이게 한다. 정보량이 많아도 카드 chrome이 반복되지 않으므로 시각적 피로가 상대적으로 낮고, 사용자는 텍스트의 크기·색·위치만으로 계층을 읽는다.

### 3.2 데스크톱 고정 내비게이션

**관찰**

- 사이트 이름은 좌측 상단에 고정된다.
- 카테고리 내비게이션도 좌측에 고정되어 본문 스크롤과 함께 움직이지 않는다.
- 현재 카테고리는 pastel lilac 텍스트이며 클릭 링크가 아닌 현재 상태 텍스트로 표현된다.
- 현재 카테고리 아래에는 페이지 내 섹션으로 이동하는 작은 anchor 링크가 들여쓰기되어 있다.
- 다른 카테고리는 큰 흰색 텍스트 링크로 이어진다.
- 우측 본문만 길게 스크롤한다.

**변형**

Bonifacio에서는 현재 카테고리를 링크가 아닌 텍스트로만 처리하지 말고 실제 링크에 aria-current="page"를 제공한다. 글 상세에서는 같은 영역을 카테고리 목록 대신 글 목차와 읽기 진행 상태로 변형한다.

## 4. 관찰: 40 / 5 / 55 레이아웃

1280×720에서 측정한 핵심 컬럼은 다음과 같다.

| 영역                 | 비율 | 측정 폭·위치 | 특징                   |
| -------------------- | ---: | ------------ | ---------------------- |
| 좌측 고정 내비게이션 |  40% | 512px, x=0   | 카테고리와 하위 anchor |
| 시각적 거터          |   5% | 64px         | 좌우 정보 영역 분리    |
| 우측 본문            |  55% | 704px, x=576 | 실제 스크롤 콘텐츠     |

우측 본문의 내부 패딩까지 제외한 실질 텍스트 폭은 약 626px였다.

### 4.1 간격 측정

**관찰**

- 좌측 내비게이션 상단 패딩: 약 103.68px
- 우측 본문 상단 패딩: 약 103.68px
- 기본 좌우 패딩: 약 25.92px
- 우측 본문의 오른쪽 패딩: 약 51.84px
- section eyebrow 아래 1px rule
- rule 위아래 여백: 각각 약 10.89px
- 목록의 한 행 리듬: 약 39.19px
- 하위 분류는 목록보다 훨씬 작은 텍스트와 큰 수직 공백으로 분리

**해석**

40/5/55는 좌측을 단순한 narrow sidebar가 아니라 화면의 한 축으로 만든다. 5% 빈 거터는 border 없이도 두 영역을 분리하며, 55% 우측 컬럼은 긴 링크명과 읽기 폭을 동시에 수용한다.

**변형**

Bonifacio는 기본 비율을 계승하되 초광폭에서 본문이 지나치게 넓어지지 않도록 읽기 영역을 최대 740px 안팎으로 제한한다. 추천 grid 개념은 다음과 같다.

    grid-template-columns:
      minmax(280px, 38vw)
      clamp(48px, 6vw, 112px)
      minmax(0, 1fr);

레퍼런스를 숫자 그대로 복제하는 것보다, **큰 고정 좌측 축 + 의도적인 빈 거터 + 제한된 읽기 컬럼**의 관계를 유지하는 것이 중요하다.

## 5. 관찰: 색상 시스템

### 5.1 계산된 주요 색

| 역할                       | freesourc.es 관찰값 |         검정 배경 대비비 |
| -------------------------- | ------------------- | -----------------------: |
| 배경                       | #000000             |                해당 없음 |
| 주 텍스트                  | #FFFFFF             |                  21.00:1 |
| 보조 텍스트                | #7B7B7B             |                   4.96:1 |
| active / hover / Info 배경 | #F6CDFF             |                  15.10:1 |
| Info 텍스트                | #000000             | lilac 배경에서 높은 대비 |

**관찰**

- active 카테고리와 링크 hover가 동일한 lilac 색을 공유한다.
- Info 페이지는 lilac를 작은 강조색이 아니라 화면 전체 배경으로 확장한다.
- 선은 흰색 1px이며 카드 테두리나 surface 분리는 거의 없다.
- shadow, gradient, 반투명 유리 효과는 확인하지 못했다.

**해석**

강조색을 한 개만 사용하기 때문에 색상이 즉시 상태와 장소를 의미한다. Info 화면의 대규모 색 반전은 평소 검정 화면과 강한 기억 대비를 만든다.

**변형**

Bonifacio는 관계를 유지하되 자체 브랜드 톤으로 약간 이동할 수 있다.

| Bonifacio token | 제안값                    | 용도                    |
| --------------- | ------------------------- | ----------------------- |
| --bg            | #070707                   | 기본 배경               |
| --surface       | #111111                   | 코드·필요한 보조 표면만 |
| --text          | #F5F3EE                   | 약간 따뜻한 주 텍스트   |
| --muted         | #858585                   | 메타데이터·caption      |
| --accent        | #EFC8FF                   | active, focus, overlay  |
| --line          | rgba(245, 243, 238, 0.82) | 1px editorial rule      |

카테고리마다 여러 색을 추가하거나 상태마다 서로 다른 색을 사용하면 이 레퍼런스의 명료성이 깨진다. 성공·오류 등 의미상 꼭 필요한 상태색을 제외하면 주요 브랜드 강조는 한 가지 lilac에 집중한다.

## 6. 관찰: 타이포그래피 계층

freesourc.es는 Helvetica Neue 계열의 일반 굵기와 별도 icon font를 사용한다.

### 6.1 데스크톱 측정

| 역할                   |       크기 |       행간 | 색·굵기         |
| ---------------------- | ---------: | ---------: | --------------- |
| 주 카테고리 내비게이션 | 약 21.77px | 약 39.19px | 흰색, 400       |
| 하위 anchor 내비게이션 | 약 14.52px | 약 26.13px | 흰색, 400       |
| 본문 주요 링크         | 약 21.77px | 약 39.19px | 흰색, 400       |
| section eyebrow        | 약 14.52px | 약 26.13px | 흰색, uppercase |
| 본문 하위 분류         | 약 14.52px | 약 26.13px | #7B7B7B         |
| Info 대형 문장         | 약 36.29px | 약 47.17px | 검정, 400       |

**관찰**

- 대부분 font-weight 400이다.
- 링크는 기본 밑줄이 없다.
- 글자 간격은 과장되지 않고 기본값에 가깝다.
- 계층은 굵기보다 크기, 행간, 대문자, 색, 들여쓰기로 표현한다.
- 모바일 목록 글자는 약 23.59px로 데스크톱보다 조금 커진다.
- 390px 모바일 Info 문장은 약 39.31px / 51.11px이다.

### 6.2 Bonifacio 한국어 타이포그래피 변형

**변형**

추천 font stack:

    "Pretendard Variable", Pretendard, "Noto Sans KR",
    "Apple SD Gothic Neo", Inter, "Helvetica Neue", sans-serif

코드 font stack:

    "IBM Plex Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, monospace

추천 계층:

| 역할             | Bonifacio 권장값                      | 비고                                      |
| ---------------- | ------------------------------------- | ----------------------------------------- |
| 홈·목록 제목     | clamp(22px, 2vw, 30px) / 1.55~1.7     | 한 행 전체가 충분한 hit area가 되게 함    |
| 좌측 카테고리    | 20~23px / 1.7~1.8                     | source의 느슨한 리듬 유지                 |
| section eyebrow  | 12~14px / 1.5                         | 영문은 uppercase, 한글은 자간만 소폭 조정 |
| 메타데이터       | 12~14px / 1.5~1.7                     | date, tag, reading time                   |
| 글 상세 제목     | clamp(44px, 6vw, 88px) / 0.98~1.1     | word-break: keep-all                      |
| 한국어 본문      | clamp(17px, 1.15vw, 19px) / 1.75~1.85 | max-width 약 680~740px                    |
| Info/Search 문장 | clamp(40px, 5.4vw, 88px) / 1.12~1.3   | 짧은 editorial copy 전용                  |

큰 제목과 한국어 본문에는 word-break: keep-all을 사용하되 URL·긴 코드·영문 토큰은 overflow-wrap: anywhere로 별도 처리한다.

## 7. 관찰: 선, 여백, 이미지, 표면

**관찰**

- section eyebrow 뒤에 1px 수평선이 반복된다.
- 카드는 없고, 항목은 한 줄 링크로 직접 배치된다.
- border-radius는 실질적으로 0이다.
- 링크 행 사이에 별도 divider를 남발하지 않는다.
- 하위 그룹은 작은 회색 label과 큰 공백으로 구분된다.
- 카테고리 콘텐츠에는 썸네일이나 hero 이미지가 없다.
- 화면의 개성은 타이포그래피와 negative space에서 나온다.

**변형**

- 홈과 아카이브의 기본 단위는 card가 아니라 PostIndexRow다.
- rounded card, pill tag, drop shadow를 기본 문법으로 삼지 않는다.
- 썸네일은 항상 보이는 grid 대신 게시물 행의 hover·focus preview로 제한한다.
- cover가 없는 글에는 Bonifacio 자체 타이포그래피 포스터 또는 단색·선 기반 preview를 생성할 수 있다.
- 코드 블록과 표처럼 별도 표면이 필요한 콘텐츠만 #111111 surface를 사용한다.

## 8. 관찰: 실제 hover, cursor, scroll, route motion

### 8.1 실제로 확인한 동작

**관찰**

- 링크 hover: 흰색에서 #F6CDFF로 즉시 변경된다.
- active press: opacity 0.7이 적용된다.
- html에 scroll-behavior: smooth가 있어 페이지 내 anchor가 부드럽게 이동한다.
- 기본 링크 cursor는 pointer이고 별도 custom cursor는 없다.
- 링크와 주요 페이지 요소의 계산된 transition-duration은 0s였다.
- 실제 사용된 scroll reveal class나 parallax 요소는 확인하지 못했다.
- prefers-reduced-motion 대응 규칙은 확인하지 못했다.
- 카테고리 이동 시 브라우저 navigation은 발생하지만, 자체적인 복잡한 route transition은 관찰하지 못했다.

### 8.2 잘못 해석하면 안 되는 것

화면 전체가 검게 dim되고 hover 대상만 spotlight처럼 남는 효과는 조사 도구의 표식이며 freesourc.es 자체 효과가 아니다. Bonifacio에서 이를 사용하려면 source 모방이 아니라 별도의 새 디자인 결정으로 취급해야 한다.

### 8.3 디자인 해석

**해석**

freesourc.es의 생동감은 애니메이션 양이 아니라 높은 정보 밀도와 즉각적인 lilac 상태 변화에서 나온다. Bonifacio의 모션도 텍스트 계층을 방해하지 않는 짧고 방향성 있는 반응이어야 한다.

## 9. 관찰: 모바일 반응형 동작

### 9.1 전환 경계

**관찰**

- 769px 폭에서는 body가 mobile/full-width 상태였다.
- 770px 폭에서는 데스크톱 고정 내비게이션이 나타났다.
- 따라서 조사 환경에서 실제 구조 전환은 769px과 770px 사이였다.
- 이는 관찰값이며 Bonifacio가 동일한 1px 경계를 그대로 복제해야 한다는 뜻은 아니다.

### 9.2 390×844 화면

**관찰**

- 좌측 고정 카테고리 내비게이션이 사라진다.
- 좌측 상단 사이트 이름과 우측 상단 햄버거가 고정된다.
- 햄버거는 약 36×36px이다.
- 본문은 100% 단일 컬럼이다.
- 좌우 gutter는 약 16.84px이다.
- 링크 글자는 약 23.59px, line-height는 약 42.46px이다.
- 모바일 전체 화면 메뉴는 검정 배경에 카테고리 한 줄 목록과 우측 상단 lilac 닫기 표시를 사용한다.
- Info는 전체 lilac 배경이며 대형 문장이 한 컬럼으로 흐른다.

### 9.3 Bonifacio 모바일 변형

**변형**

- 실제 글 목록과 긴 글 제목을 넣어 280~3840px에서 측정한 결과, Bonifacio는 900px 이하에서 tablet까지 single-column 모드로 전환한다. 901px부터는 fluid rail을 사용하며 1px 경계 양쪽에서 rail 폭이 급변하지 않는다.
- 60~64px 높이의 header에 wordmark와 실제 button 메뉴를 둔다.
- 본문 gutter는 320px에서 16px으로 시작해 tablet에서 24px까지 유동적으로 늘어난다.
- 메뉴, 닫기, 복사, 검색 등 모든 interactive target은 최소 44×44px로 만든다.
- 목록 제목은 22~26px로 크게 유지한다.
- 장문 본문은 17~18px로 분리해 source Info의 초대형 글자 크기를 그대로 본문에 적용하지 않는다.
- 전체 화면 메뉴가 열린 동안 배경 scroll을 잠그고 닫으면 기존 scroll 위치를 복구한다.
- env(safe-area-inset-top/bottom)을 반영한다.
- 1230px 이하에서는 목록 metadata를 한 단계 접어 여섯 열짜리 desktop row가 폭보다 커지지 않게 한다.
- 모바일 목차는 native `details` disclosure로 접고, 긴 목차만 제한 높이 안에서 독립적으로 scroll한다.
- 구현 후 측정값과 재검증 절차는 [반응형 QA 기록](RESPONSIVE_QA.md)에 고정한다.

## 10. 관찰: Info 화면과 색상 전환

**관찰**

- [Info](https://freesourc.es/Info)는 별도 route지만 시각적으로 modal/takeover처럼 보인다.
- 화면 전체의 page background가 #F6CDFF로 전환된다.
- 데스크톱 콘텐츠 컬럼은 55% 폭, 화면 중앙에 배치된다.
- 대형 검정 문장과 밑줄 링크가 있다.
- 닫기는 좌측 상단에 놓인다.
- 모바일에서도 lilac 전체 화면을 유지한다.

**해석**

Info는 평상시 검정 인덱스의 반대 세계처럼 작동한다. 작은 hover accent였던 lilac가 전체 면이 되면서 사이트의 기억점이 된다.

**변형**

Bonifacio에서는 이를 단순 About 복제에 그치지 않고 About과 Search/Command surface를 묶는 두 번째 UI 모드로 사용한다.

- About: lilac 전체 화면 editorial copy
- Search: 같은 배경 위의 대형 검색 입력과 검정 결과 인덱스
- Command: 카테고리, 최근 글, 태그로 빠르게 이동
- 닫기: 실제 button, Escape, focus trap, 이전 route 복구

source의 소개 문구, 장식 기호, 링크 문구는 복사하지 않는다.

## 11. 관찰: 접근성 문제와 Bonifacio 보완

### 11.1 레퍼런스에서 확인한 문제

**관찰**

- 조사한 Design 화면에는 main, nav, header, footer, aside landmark가 없었다.
- aria-label과 aria-current가 없었다.
- 전역 :focus { outline: 0 } 규칙이 있고 대체 focus 표시를 확인하지 못했다.
- 모바일 메뉴 아이콘의 accessible name이 전용 글리프에 의존한다.
- viewport에 user-scalable=no가 포함되어 확대를 막는다.
- 390px의 햄버거는 약 36×36px이며 일부 inline 링크의 실제 box 높이는 약 29px이다.
- Mobile Menu와 Info의 닫기 이동이 javascript:history.go(-1)에 의존한다.
- Design 페이지의 외부 링크 185개는 새 탭 target을 사용하지만 명시적 rel 속성이 없었다.
- prefers-reduced-motion 대응이 없었다.
- 시각 내비게이션을 h1/h2로 표현해 문서 heading 구조와 navigation 구조가 섞인다.

### 11.2 Bonifacio 필수 보완

**변형 — 구현 필수 조건**

- html lang="ko"
- header, nav, main, aside, footer landmark
- 현재 route와 현재 TOC 항목에 aria-current
- 첫 focus 시 보이는 skip link
- :focus-visible에 최소 2px accent outline과 충분한 offset
- pinch zoom 허용, user-scalable=no 금지
- 최소 44×44px touch target
- 메뉴 button에 aria-label, aria-expanded, aria-controls
- overlay dialog에 적절한 role/aria-modal, focus trap, Escape 처리
- route 변경 뒤 main heading으로 focus 이동
- 올바른 h1 → h2 → h3 문서 순서
- 외부 새 탭에 rel="noopener noreferrer"
- 색만으로 상태를 전달하지 않고 marker, underline 또는 aria-current를 병행
- prefers-reduced-motion에 대한 동등한 정보 상태 제공
- 검색 결과와 목록 item은 키보드 focus에서도 hover와 같은 preview·metadata를 제공

## 12. Bonifacio 페이지 매핑

| Bonifacio surface | freesourc.es에서 가져올 원리        | 독자적으로 추가할 기능                                   |
| ----------------- | ----------------------------------- | -------------------------------------------------------- |
| Home              | 고정 좌측 계층 + 우측 텍스트 인덱스 | 날짜, 제목, tag, reading time, featured 상태, preview    |
| Category / Tag    | 현재 카테고리 accent, 하위 anchor   | 글 수, filter context, pagination 또는 load-more         |
| Archive           | 섹션 eyebrow + 1px rule + 긴 목록   | 연도 scrollspy, 월 grouping                              |
| Article Detail    | 55% 우측 읽기 컬럼                  | 큰 제목, 본문, TOC, progress, code, image, related posts |
| Search            | Info의 전체 화면 색 반전            | 대형 input, keyboard search, 결과 인덱스, empty state    |
| About             | Info의 editorial takeover           | Bonifacio 고유 문구와 연결 정보                          |
| Mobile Menu       | 검정 전체 화면 카테고리 목록        | focus trap, 44px target, route state, scroll lock        |

## 13. 홈과 목록 화면 사양

### 13.1 Desktop Home

**변형**

좌측 고정 rail:

- Bonifacio / Journal wordmark
- All Posts
- Engineering
- Essay
- Notes
- Travel 또는 실제 데이터에서 파생된 카테고리
- Archive
- About
- 선택적으로 RSS

우측 인덱스:

- 작은 eyebrow: RECENT NOTES / 현재 연도
- 1px rule
- PostIndexRow 반복
- 섹션 사이 큰 공백
- 페이지 하단 이전/다음 또는 더 보기

PostIndexRow 권장 정보:

| 우선순위 | 필드            | 표현                                |
| -------: | --------------- | ----------------------------------- |
|        1 | title           | 가장 큰 regular-weight 텍스트       |
|        2 | publishedAt     | YYYY.MM.DD 또는 locale date         |
|        3 | category / tags | 작은 muted text                     |
|        4 | reading time    | 작은 muted text                     |
|        5 | excerpt         | 기본 상태에서는 숨기거나 1~2줄 제한 |
|        6 | cover preview   | hover·focus 시에만 선택적으로 표시  |

행 전체가 link가 되어야 하며, title만 좁은 inline hit area가 되어서는 안 된다.

### 13.2 Category / Tag / Archive

**변형**

- URL context를 좌측 accent와 우측 eyebrow 모두에 반영한다.
- 연도·카테고리 그룹 사이에 72~112px 수준의 큰 spacing을 허용한다.
- 연도 heading이 viewport에 들어올 때 좌측 rail의 현재 연도 marker를 갱신한다.
- pagination UI도 rounded control 묶음보다 텍스트 링크와 rule 문법을 사용한다.
- 결과 없음은 큰 빈 카드 대신 짧은 editorial sentence와 관련 카테고리 link로 처리한다.

## 14. 글 상세 화면 사양

### 14.1 구조

**변형**

좌측 rail:

- Back to index
- 현재 글의 h2/h3 목차
- active heading marker
- 읽기 진행률
- 글 공유·링크 복사는 하단의 작은 text action

우측 reader:

- category eyebrow
- 큰 h1
- publishedAt, updatedAt, reading time, tags
- article body
- footnotes 또는 references
- related / previous / next posts를 PostIndexRow 문법으로 재사용

### 14.2 콘텐츠 요소

- Paragraph: 최대 680~740px, 17~19px, 1.75~1.85 line-height
- Heading: 충분한 scroll-margin-top을 부여해 sticky header 아래에 가리지 않게 함
- Link: 기본 underline 또는 명확한 text-decoration을 본문에서는 허용
- Blockquote: 2px lilac rule, 큰 regular-weight text
- Code block: #111111 surface, horizontal scroll, language label, Copy button
- Inline code: 미세한 surface와 고정폭 서체, 과도한 pill radius 금지
- Image: 본문 폭 또는 의도적 full-bleed variant, caption은 muted
- Table: 작은 화면에서 horizontal scroll 또는 구조화된 stacked fallback
- Footnote: URL hash와 Back reference를 키보드로 사용할 수 있어야 함

## 15. Search와 About takeover 사양

### 15.1 Search

**변형**

- lilac full-screen layer
- 상단 실제 Close button
- 큰 무테 search input과 한 줄 rule
- 입력 즉시 결과를 검정 text index로 업데이트
- 방향키 또는 Tab으로 결과 이동
- Escape로 닫기
- 검색어가 없을 때 최근 글·주요 카테고리 제안
- 결과 없음은 문장형 empty state
- 화면 reader에 결과 수와 loading 상태를 전달

### 15.2 About

**변형**

- Info의 large editorial type와 색 반전 원리만 차용
- Bonifacio의 목적, 작성자 소개, 주요 링크를 고유 문장으로 작성
- source의 꽃 장식, 소개 문구, 기여 문구를 복사하지 않음
- 모바일에서는 body copy를 32~44px 범위로 제한하고 매우 긴 문장은 별도 paragraph로 나눔

## 16. 모션 시스템

freesourc.es 자체 모션은 절제되어 있으므로 Bonifacio 모션은 **새로운 확장**으로 명시한다.

### 16.1 Motion tokens

| token            |                           값 | 용도                       |
| ---------------- | ---------------------------: | -------------------------- |
| --motion-instant |                         80ms | press feedback, 작은 state |
| --motion-fast    |                        150ms | color, underline, metadata |
| --motion-base    |                        240ms | preview, TOC marker        |
| --motion-menu    |                        300ms | mobile drawer/takeover     |
| --motion-route   |                        420ms | page transition            |
| --ease-editorial | cubic-bezier(.22, 1, .36, 1) | 대부분의 enter/exit        |

### 16.2 Interaction spec

| 트리거               | 독자적 Bonifacio 효과                             |           시간 | 구현 메모                      |
| -------------------- | ------------------------------------------------- | -------------: | ------------------------------ |
| Post row hover/focus | 제목 lilac, x축 6~8px 이동, rule scaleX           |      150~180ms | hover와 focus 동일             |
| Post preview enter   | 컬럼 경계에 image/typographic preview clip reveal |      220~280ms | transform/opacity만            |
| Post preview pointer | 최대 ±6px의 미세 parallax                         | pointer 환경만 | native cursor 유지             |
| Category change      | lilac sheet wipe 후 새 목록이 y=12px에서 enter    |      360~440ms | View Transitions + fallback    |
| Article enter        | 제목, meta, 첫 문단 30~45ms stagger               |  총 320ms 이하 | 과도한 지연 금지               |
| TOC update           | lilac marker가 다음 heading으로 이동              |      180~240ms | layout 측정 최소화             |
| Reading progress     | 좌우 거터의 1px 세로선이 scroll 비율로 채워짐     |  scroll-linked | requestAnimationFrame 또는 CSS |
| Mobile menu          | black sheet clip reveal, 항목 25~35ms stagger     |      260~320ms | focus trap/scroll lock 병행    |
| Search/About         | lilac sheet가 trigger 방향에서 확장               |      320~400ms | route 상태 보존                |
| Code copy            | label이 check state로 바뀌고 lilac line sweep     |      220~280ms | aria-live feedback             |

### 16.3 Reduced motion 사양

**변형 — 구현 필수 조건**

prefers-reduced-motion: reduce에서:

- route wipe, clip reveal, parallax, stagger, 큰 translate를 제거한다.
- 정보 상태 변화는 즉시 적용하거나 80ms 이하 opacity transition만 사용한다.
- preview가 기능적으로 필요한 경우 이동 없이 나타나고 사라지게 한다.
- reading progress와 active TOC 상태는 유지하되 glide animation을 제거한다.
- mobile menu는 즉시 열고 닫거나 짧은 opacity 전환만 사용한다.
- auto-scrolling, looping background animation, continuous marquee를 사용하지 않는다.

### 16.4 성능 경계

- transform과 opacity를 우선 사용한다.
- pointermove에서 top/left, width/height를 반복 변경하지 않는다.
- scroll event마다 전체 DOM을 측정하지 않는다.
- IntersectionObserver로 section 진입을 감지한다.
- preview 이미지는 필요한 크기로 최적화하고 hover 직전 또는 viewport 근처에서 preload한다.
- 한 화면에 여러 preview animation을 동시에 실행하지 않는다.

## 17. 권장 공통 토큰

    --bg: #070707;
    --surface: #111111;
    --text: #f5f3ee;
    --muted: #858585;
    --accent: #efc8ff;
    --line: rgba(245, 243, 238, 0.82);

    --page-pad: clamp(20px, 2.25vw, 36px);
    --page-top: clamp(88px, 8vw, 128px);
    --group-gap: clamp(72px, 8vw, 112px);
    --reader-max: 740px;

    --motion-instant: 80ms;
    --motion-fast: 150ms;
    --motion-base: 240ms;
    --motion-menu: 300ms;
    --motion-route: 420ms;
    --ease-editorial: cubic-bezier(.22, 1, .36, 1);

토큰은 최종 UI의 실제 폰트 렌더링과 Raspberry Pi 환경의 성능을 확인하면서 조정한다. 레퍼런스의 rem 계산값을 그대로 하드코딩하지 않는다.

## 18. 피해야 할 것

### 18.1 레퍼런스 모방 위험

- freesourc.es의 소개 문구, 꽃 기호, 아이콘 글리프를 복사하지 않는다.
- 외부 resource 링크나 이름을 Bonifacio 콘텐츠처럼 가져오지 않는다.
- 레퍼런스와 동일한 모바일 glyph/font asset을 사용하지 않는다.
- Info 화면의 문장 배치까지 픽셀 단위로 복제하지 않는다.
- source의 exact route 명명이나 taxonomy를 복제하지 않는다.

### 18.2 시각적 과잉

- 모든 글을 rounded card에 넣지 않는다.
- tag를 pill chip으로 과도하게 만들지 않는다.
- 여러 accent color, gradient, glow, glassmorphism을 동시에 넣지 않는다.
- shadow로 계층을 만들지 않는다.
- 항상 움직이는 custom cursor, marquee, noise animation을 넣지 않는다.
- 모든 section에 scroll reveal을 반복하지 않는다.
- hover preview가 본문 읽기나 키보드 navigation을 방해하게 하지 않는다.

### 18.3 source의 접근성 문제 복제

- outline: none만 적용하지 않는다.
- user-scalable=no를 사용하지 않는다.
- icon font glyph만으로 button 이름을 표현하지 않는다.
- javascript:history.go(-1)을 닫기의 유일한 동작으로 사용하지 않는다.
- 시각적 heading을 모두 h1/h2로 만들지 않는다.
- color 하나만으로 active 상태를 표현하지 않는다.
- 36px 이하의 menu touch target을 복제하지 않는다.

## 19. 반응형 검수 매트릭스

|          폭 | 기대 상태             | 확인할 핵심                                        |
| ----------: | --------------------- | -------------------------------------------------- |
| 2560px 이상 | capped ultrawide      | index canvas 1792px 상한, reader 폭 유지           |
| 1440px 이상 | capped desktop        | reader 폭 800px 이하, 좌측 rail 과도하게 넓지 않음 |
|      1280px | 기준 desktop          | 비대칭 rail/gutter/reader, fixed navigation        |
| 1230/1231px | row metadata 경계     | 여섯 열 전환 전후 clipping 없음                    |
| 1080/1081px | 과거 실패 경계        | rail·row 불연속과 clipping 없음                    |
|       901px | compact desktop 시작  | rail footer 접근, 짧은 높이 typography             |
|       900px | tablet single-column  | menu 전환, scroll lock, content jump 없음          |
|   769/770px | source 관찰 경계 참고 | Bonifacio는 양쪽 모두 안정적인 single-column       |
|     844×390 | mobile landscape      | menu/search 내부 scroll과 고정 close               |
|       390px | 표준 mobile           | 18~20px gutter, 44px target, 큰 index type         |
|       320px | 지원 최소 mobile      | 긴 영문 제목, URL, code의 국소 overflow            |

## 20. 구현 UI 재검토 체크리스트

후속 브라우저 검토에서는 다음을 실제 화면으로 확인한다.

### Desktop

- 좌측 rail이 스크롤 중 고정되는가?
- rail, gutter, reader의 비대칭 관계가 40/5/55 레퍼런스 원리를 유지하는가?
- reader가 740px보다 과도하게 넓어지지 않는가?
- section eyebrow, 1px rule, group spacing이 일관적인가?
- 카드·pill·shadow가 인덱스 문법을 압도하지 않는가?
- hover와 keyboard focus가 같은 preview·accent 상태를 제공하는가?

### Article

- h1/h2/h3 구조가 올바른가?
- 한국어 본문의 line length와 line-height가 편안한가?
- TOC active state와 progress가 정확한가?
- code, image, blockquote, table이 dark editorial system 안에서 읽히는가?
- route 이동 후 focus와 scroll restoration이 올바른가?

### Search / About

- lilac takeover가 source의 문구·배치를 복제하지 않고 Bonifacio 기능으로 재해석되었는가?
- Escape, Close button, focus trap이 작동하는가?
- 검색 결과와 empty/loading state가 screen reader에 전달되는가?

### Mobile

- breakpoint 전후에 content jump나 horizontal overflow가 없는가?
- 44×44px target이 보장되는가?
- menu open 중 background scroll이 잠기는가?
- 긴 제목과 한국어 word-break가 안정적인가?
- safe area와 sticky header가 겹치지 않는가?

### Motion

- hover motion이 180ms 안팎으로 즉각적인가?
- route transition이 콘텐츠 접근을 지연시키지 않는가?
- 한 화면에서 preview가 하나만 활성화되는가?
- reduced-motion에서 wipe, parallax, stagger가 제거되는가?
- transform/opacity 위주로 60fps에 가깝게 동작하는가?

## 21. 최종 디자인 원칙

Bonifacio Blog가 freesourc.es에서 가져갈 것은 다음 다섯 가지다.

1. 큰 비중을 차지하는 고정 좌측 내비게이션
2. 카드가 아닌 활자 중심의 고밀도 인덱스
3. 상태와 장소를 묶는 단 하나의 강한 accent
4. 선과 공백으로 만드는 editorial hierarchy
5. 모바일과 Info/Search에서 사용하는 단호한 전체 화면 전환

그리고 Bonifacio가 독자적으로 더해야 할 것은 다음 여섯 가지다.

1. 게시물 날짜·tag·reading time·excerpt를 담는 PostIndexRow
2. hover와 keyboard focus에서 동작하는 cover/typographic preview
3. 글 상세 TOC, reading progress, code·image·footnote 시스템
4. 검색과 About을 묶는 기능적인 lilac takeover
5. 짧고 방향성 있는 route·preview·menu motion
6. semantic landmarks, focus visibility, zoom, reduced motion을 포함한 완전한 접근성

이 경계를 지키면 레퍼런스를 깊게 이해한 흔적은 보이면서도 freesourc.es의 복제품이 아닌 Bonifacio 고유의 블로그 경험을 만들 수 있다.
