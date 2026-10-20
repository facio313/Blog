import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
} from 'framer-motion'
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  LayoutGrid,
  List,
  Menu,
  Search,
  X,
} from 'lucide-react'
import {
  Fragment,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Link,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'
import { getMeta, getPost, getPosts, isNotFound } from './api'
import { CategoryLinks } from './CategoryLinks'
import { motionEase } from './motion'
import { collectionUrl } from './navigation'
import type { MetaResponse, PostDetail, PostSummary } from './types'

const emptyMeta: MetaResponse = {
  categories: [],
  stats: { posts: 0, categories: 0, latestPublishedAt: null },
}

const titleBreakPattern = /(\s+|[/,:;!?·_-]+)/u
const titleBreakTokenPattern = /^[/,:;!?·_-]+$/u

function BreakableTitle({ value }: { value: string }) {
  const pieces = value.split(titleBreakPattern)
  return pieces.map((piece, index) => {
    const lastDot = piece.lastIndexOf('.')
    const canBreakDottedToken = lastDot >= 0 && piece.indexOf('.') !== lastDot
    return (
      <Fragment key={`${index}-${piece}`}>
        {canBreakDottedToken ? piece.slice(0, lastDot + 1) : piece}
        {titleBreakTokenPattern.test(piece) || canBreakDottedToken ? <wbr /> : null}
        {canBreakDottedToken ? piece.slice(lastDot + 1) : null}
      </Fragment>
    )
  })
}

function formatDate(value: string | null, long = false): string {
  if (!value) return '날짜 미상'
  return new Intl.DateTimeFormat('ko-KR', {
    year: long ? 'numeric' : '2-digit',
    month: long ? 'long' : '2-digit',
    day: long ? 'numeric' : '2-digit',
  }).format(new Date(value))
}

function setMetaContent(selector: string, content: string): void {
  document.querySelector<HTMLMetaElement>(selector)?.setAttribute('content', content)
}

function usePageMetadata(title: string, description: string, isArticle = false): void {
  const location = useLocation()

  useEffect(() => {
    const fullTitle = title === 'Bonifacio Notes' ? title : `${title} — Bonifacio Notes`
    const canonical = `${window.location.origin}/blog${location.pathname === '/' ? '/' : location.pathname}`
    document.title = fullTitle
    document
      .querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?.setAttribute('href', canonical)
    setMetaContent('meta[name="description"]', description)
    setMetaContent('meta[property="og:title"]', fullTitle)
    setMetaContent('meta[property="og:description"]', description)
    setMetaContent('meta[property="og:url"]', canonical)
    setMetaContent('meta[property="og:type"]', isArticle ? 'article' : 'website')
    setMetaContent('meta[name="twitter:title"]', fullTitle)
    setMetaContent('meta[name="twitter:description"]', description)
    setMetaContent(
      'meta[property="og:image"]',
      isArticle ? '' : `${window.location.origin}/blog/og.png`,
    )
    setMetaContent(
      'meta[name="twitter:image"]',
      isArticle ? '' : `${window.location.origin}/blog/og.png`,
    )
  }, [description, isArticle, location.pathname, title])
}

function ScrollManager(): null {
  const { pathname, hash, state } = useLocation()
  const previousPathname = useRef(pathname)

  useEffect(() => {
    const pathnameChanged = previousPathname.current !== pathname
    previousPathname.current = pathname
    if (state?.preserveScroll) return
    if (hash) {
      window.requestAnimationFrame(() => document.querySelector(hash)?.scrollIntoView())
    } else if (pathnameChanged) {
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [hash, pathname, state])
  return null
}

interface ChromeProps {
  children: ReactNode
  meta: MetaResponse
  activeCategory?: string | undefined
  onSearch: () => void
}

function SiteChrome({ children, meta, activeCategory, onSearch }: ChromeProps) {
  const { pathname, search, hash } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const mobileTriggerRef = useRef<HTMLButtonElement>(null)
  const closeMobile = useCallback(() => {
    setMobileOpen(false)
  }, [])
  const restoreMobileFocus = useCallback(() => {
    window.requestAnimationFrame(() => mobileTriggerRef.current?.focus({ preventScroll: true }))
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname, search, hash])

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>
      <header className="site-header">
        <Link className="wordmark" to="/" aria-label="Bonifacio Notes 홈">
          <span className="wordmark-symbol" aria-hidden="true">
            b<span>/</span>
          </span>
          <span>
            bonifacio<small>personal field notes</small>
          </span>
        </Link>
        <Link
          className="header-index-link"
          to={collectionUrl(pathname, new URLSearchParams(search).get('view'))}
        >
          the index <ArrowDownRight size={16} aria-hidden="true" />
        </Link>
        <UtilityBar onSearch={onSearch} />
        <button
          ref={mobileTriggerRef}
          className="mobile-menu-trigger"
          type="button"
          aria-label="Index"
          aria-expanded={mobileOpen}
          aria-controls="mobile-index"
          onClick={() => setMobileOpen(true)}
        >
          <span>Index</span>
          <Menu size={19} aria-hidden="true" />
        </button>
      </header>

      <main id="main-content">{children}</main>

      <footer className="site-footer">
        <Link to="/">
          b/notes<span aria-hidden="true">.</span>
        </Link>
        <p>계속 배우고, 계속 기록합니다.</p>
        <div>
          <span>{meta.stats.posts} public notes</span>
          <span>Seoul · Since 2022</span>
        </div>
      </footer>

      <AnimatePresence onExitComplete={restoreMobileFocus}>
        {mobileOpen ? (
          <MobileIndex
            categories={meta.categories}
            activeCategory={activeCategory}
            onClose={closeMobile}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function UtilityBar({ onSearch }: { onSearch: () => void }) {
  return (
    <div className="utility-bar">
      <button className="search-trigger" type="button" aria-label="검색 열기" onClick={onSearch}>
        <Search size={16} strokeWidth={1.8} aria-hidden="true" />
        <span>Search</span>
        <kbd>/</kbd>
      </button>
    </div>
  )
}

function MobileIndex({
  categories,
  activeCategory,
  onClose,
}: {
  categories: MetaResponse['categories']
  activeCategory?: string | undefined
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    dialog.showModal()
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      dialog.close()
    }
  }, [onClose])

  return (
    <motion.dialog
      ref={dialogRef}
      className="mobile-index"
      id="mobile-index"
      role="dialog"
      aria-modal="true"
      aria-label="모바일 블로그 인덱스"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      initial={reduceMotion ? false : { opacity: 0, x: '12%', rotateY: 18 }}
      animate={{ opacity: 1, x: 0, rotateY: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: '-8%', rotateY: -12 }}
      transition={{ duration: reduceMotion ? 0 : 0.4, ease: motionEase }}
    >
      <div className="mobile-index-head">
        <span>
          explore<span className="accent">.</span>
        </span>
        <button type="button" onClick={onClose} aria-label="인덱스 닫기" autoFocus>
          <X aria-hidden="true" />
        </button>
      </div>
      <CategoryLinks
        categories={categories}
        activeCategory={activeCategory}
        variant="menu"
        onSelect={onClose}
      />
      <p className="mobile-index-note">Field notes from Seoul · Since 2022</p>
    </motion.dialog>
  )
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const reduceMotion = useReducedMotion()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PostSummary[]>([])
  const [loading, setLoading] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    dialog.showModal()
    inputRef.current?.focus()
    window.addEventListener('keydown', handleEscape)
    return () => {
      window.removeEventListener('keydown', handleEscape)
      dialog.close()
    }
  }, [onClose])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const timer = window.setTimeout(
      () => {
        setLoading(true)
        void getPosts(query.trim() ? { query: query.trim() } : { limit: 6 }, controller.signal)
          .then((response) => {
            if (active) setResults(response.items)
          })
          .catch((error: unknown) => {
            if (error instanceof DOMException && error.name === 'AbortError') return
            if (active) setResults([])
          })
          .finally(() => {
            if (active) setLoading(false)
          })
      },
      query ? 180 : 0,
    )

    return () => {
      active = false
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  return (
    <dialog
      className="search-dialog"
      ref={dialogRef}
      aria-labelledby="search-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
    >
      <motion.div
        className="search-panel"
        initial={reduceMotion ? false : { opacity: 0, x: 80, rotateY: 24 }}
        animate={{ opacity: 1, x: 0, rotateY: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -40, rotateY: -12 }}
        transition={{ duration: reduceMotion ? 0 : 0.42, ease: motionEase }}
      >
        <header>
          <p className="search-wordmark">
            search<span className="accent">.</span>
            <span className="search-heading-echo" aria-hidden="true">
              your notes
            </span>
          </p>
          <button type="button" onClick={onClose} aria-label="검색 닫기">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="search-scroll">
          <form onSubmit={(event: FormEvent) => event.preventDefault()}>
            <label id="search-title" htmlFor="site-search">
              무엇을 다시 찾고 있나요?
            </label>
            <div className="search-field">
              <Search size={28} aria-hidden="true" />
              <input
                id="site-search"
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Java, HTTP, B-Tree…"
                autoComplete="off"
              />
            </div>
          </form>
          <div className="search-results" aria-live="polite" aria-busy={loading}>
            <p className="search-result-label">
              {loading ? 'Searching…' : query ? `${results.length} results` : 'Recent notes'}
            </p>
            {results.map((post, index) => (
              <Link
                to={`/posts/${post.slug}`}
                state={{ category: post.category }}
                onClick={onClose}
                key={post.slug}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>
                  <BreakableTitle value={post.title} />
                </strong>
                <small>{post.category}</small>
                <ArrowUpRight aria-hidden="true" />
              </Link>
            ))}
            {!loading && query && results.length === 0 ? (
              <p className="empty-message">일치하는 기록이 없습니다. 다른 단어로 찾아보세요.</p>
            ) : null}
          </div>
        </div>
      </motion.div>
    </dialog>
  )
}

function useMeta(): MetaResponse {
  const [meta, setMeta] = useState(emptyMeta)

  useEffect(() => {
    const controller = new AbortController()
    void getMeta(controller.signal)
      .then(setMeta)
      .catch(() => undefined)
    return () => controller.abort()
  }, [])
  return meta
}

function PanoramaHeading({ isReading }: { isReading: boolean }) {
  const reduceMotion = useReducedMotion()
  const trackRef = useRef<HTMLParagraphElement>(null)
  const motionLabelRef = useRef<HTMLSpanElement>(null)
  const titleTailRef = useRef<HTMLSpanElement>(null)
  const [motionOffset, setMotionOffset] = useState(0)
  const transition = { duration: reduceMotion ? 0 : 0.85, ease: motionEase }

  useLayoutEffect(() => {
    const track = trackRef.current
    const label = motionLabelRef.current
    const tail = titleTailRef.current
    const viewport = track?.parentElement
    if (!track || !label || !tail || !viewport) return
    const measure = () =>
      setMotionOffset(
        Math.max(
          tail.offsetLeft + tail.offsetWidth / 2,
          label.offsetLeft + label.offsetWidth - viewport.clientWidth,
        ),
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="hero-copy">
      <motion.p
        className="hero-kicker"
        initial={reduceMotion ? false : { opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.65, ease: motionEase }}
      >
        bonifacio / personal field notes
      </motion.p>
      <motion.p
        ref={trackRef}
        role={isReading ? undefined : 'heading'}
        aria-level={isReading ? undefined : 1}
        aria-label={isReading ? undefined : 'notes. in motion'}
        className="panorama-title"
        data-section={isReading ? 'motion' : 'notes'}
        initial={false}
        animate={{ x: isReading ? -motionOffset : 0 }}
        transition={transition}
      >
        <span className="hero-title" aria-hidden={isReading}>
          note
          <span ref={titleTailRef} className="hero-title-tail">
            s
          </span>
          <span className="accent">.</span>
        </span>
        <span ref={motionLabelRef} className="hero-subtitle" aria-hidden={!isReading}>
          in motion
        </span>
      </motion.p>
    </div>
  )
}

function HomeIntro({
  meta,
  onSearch,
  visible,
}: {
  meta: MetaResponse
  onSearch: () => void
  visible: boolean
}) {
  const reduceMotion = useReducedMotion()
  const transition = { duration: reduceMotion ? 0 : 0.72, ease: motionEase }

  return (
    <motion.div
      className="home-intro"
      aria-hidden={!visible}
      inert={!visible}
      initial={false}
      animate={{ height: visible ? 'auto' : 0 }}
      transition={transition}
    >
      <motion.header
        className="hero"
        initial={false}
        animate={{ y: visible ? '0%' : '-100%' }}
        transition={transition}
      >
        <nav className="hero-menu" aria-label="기록 탐색">
          <motion.a
            href="#post-index"
            initial={reduceMotion ? false : { opacity: 0, x: 64, rotateY: 55 }}
            animate={{ opacity: 1, x: 0, rotateY: 0 }}
            transition={{ duration: 0.65, ease: motionEase, delay: 0.16 }}
          >
            <span>read</span>
            <small>기록 읽기</small>
            <ArrowUpRight aria-hidden="true" />
          </motion.a>
          <motion.a
            href="#topic-index"
            initial={reduceMotion ? false : { opacity: 0, x: 64, rotateY: 55 }}
            animate={{ opacity: 1, x: 0, rotateY: 0 }}
            transition={{ duration: 0.65, ease: motionEase, delay: 0.23 }}
          >
            <span>explore</span>
            <small>주제 둘러보기</small>
            <ArrowUpRight aria-hidden="true" />
          </motion.a>
          <motion.button
            type="button"
            onClick={onSearch}
            initial={reduceMotion ? false : { opacity: 0, x: 64, rotateY: 55 }}
            animate={{ opacity: 1, x: 0, rotateY: 0 }}
            transition={{ duration: 0.65, ease: motionEase, delay: 0.3 }}
          >
            <span>search</span>
            <small>다시 찾기</small>
            <Search aria-hidden="true" />
          </motion.button>
        </nav>
        <motion.div
          className="hero-side"
          initial={reduceMotion ? false : { opacity: 0, x: 36 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: motionEase, delay: 0.25 }}
        >
          <p className="hero-side-label">a mind in progress</p>
          <div className="note-signal" aria-hidden="true">
            {[28, 44, 63, 40, 81, 58, 100, 72, 46, 66, 35, 53, 24].map((height, index) => (
              <span
                key={index}
                style={{ height: `${height}%`, animationDelay: `${index * 45}ms` }}
              />
            ))}
          </div>
          <p className="hero-statement">
            배우고, 만들고.
            <br />
            다시 꺼내 읽는 기록.
          </p>
          <p className="hero-description">
            개발하며 만난 개념과 시행착오.
            <br />
            아직 완성되지 않아서, 계속 쓰는 중입니다.
          </p>
        </motion.div>
        <div className="hero-meta">
          <span>
            <i aria-hidden="true" /> Always learning, always noting
          </span>
          <span>
            {String(meta.stats.posts).padStart(2, '0')} notes{' '}
            <span className="meta-divider">/</span> {String(meta.stats.categories).padStart(2, '0')}{' '}
            topics
          </span>
        </div>
      </motion.header>
    </motion.div>
  )
}

function NotesIndex({ meta, reading = false }: { meta: MetaResponse; reading?: boolean }) {
  const reduceMotion = useReducedMotion()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { hash, pathname } = useLocation()
  const view = searchParams.get('view') === 'list' ? 'list' : 'tiles'
  const category = searchParams.get('category') || undefined
  const [posts, setPosts] = useState<PostSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const resultsRef = useRef<HTMLDivElement>(null)
  const [pendingHeight, setPendingHeight] = useState(0)
  const CountHeading = reading ? 'h1' : 'p'
  const setView = (next: 'list' | 'tiles') => {
    const params = new URLSearchParams(searchParams)
    if (next === 'list') params.set('view', next)
    else params.delete('view')
    void navigate({ search: params.toString(), hash }, { replace: true, preventScrollReset: true })
  }

  usePageMetadata(
    reading ? category || 'All notes' : 'Bonifacio Notes',
    '개발하며 배운 것, 만든 것, 잊기 전에 적어 둔 것을 다시 읽을 수 있게 정리한 기술 블로그.',
  )

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setPendingHeight(resultsRef.current?.getBoundingClientRect().height ?? 0)
    setLoading(true)
    setFailed(false)
    void getPosts(category ? { category } : {}, controller.signal)
      .then((response) => {
        if (active) setPosts(response.items)
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (active) setFailed(true)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [category])

  const collectionTools = (
    <div className="collection-tools">
      <CountHeading id={reading ? 'post-index-title' : undefined} aria-live="polite">
        {loading ? '불러오는 중' : `${posts.length} notes`} <span>최신 기록부터</span>
      </CountHeading>
      <div className="view-switch" role="group" aria-label="글 보기 방식">
        <button
          type="button"
          aria-label="목록 보기"
          aria-pressed={view === 'list'}
          onClick={() => setView('list')}
        >
          <List size={19} aria-hidden="true" />
          <span>list</span>
        </button>
        <button
          type="button"
          aria-label="타일 보기"
          aria-pressed={view === 'tiles'}
          onClick={() => setView('tiles')}
        >
          <LayoutGrid size={17} aria-hidden="true" />
          <span>tiles</span>
        </button>
      </div>
    </div>
  )

  return (
    <>
      <section
        className={`post-index${reading ? ' reading-collection' : ''}`}
        id="post-index"
        aria-labelledby="post-index-title"
      >
        {reading ? (
          <div className="section-heading">{collectionTools}</div>
        ) : (
          <>
            <p className="eyebrow collection-eyebrow">bonifacio / the reading room</p>
            <div id="topic-index" className="index-navigation">
              <CategoryLinks
                categories={meta.categories}
                activeCategory={category}
                variant="index"
                headingId="post-index-title"
              />
              {collectionTools}
            </div>
          </>
        )}

        <div ref={resultsRef} style={{ minHeight: loading ? pendingHeight : 0 }}>
          {failed ? (
            <ErrorState />
          ) : loading ? (
            <LoadingRows />
          ) : posts.length > 0 ? (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`${category || 'all'}-${view}`}
                initial={reduceMotion ? false : { opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -20 }}
                transition={{ duration: reduceMotion ? 0 : 0.2, ease: motionEase }}
              >
                <PostList posts={posts} view={view} />
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="empty-state">
              <p>이 분류에는 공개된 기록이 아직 없습니다.</p>
              <Link to={collectionUrl(pathname, view)}>모든 기록으로 돌아가기</Link>
            </div>
          )}
        </div>
      </section>
    </>
  )
}

function PostList({ posts, view = 'list' }: { posts: PostSummary[]; view?: 'list' | 'tiles' }) {
  const reduceMotion = useReducedMotion()
  const [searchParams] = useSearchParams()
  const requestedView = searchParams.get('view')
  const viewQuery =
    requestedView === 'list' || requestedView === 'tiles' ? `?view=${requestedView}` : ''
  return (
    <div className={`post-list ${view === 'tiles' ? 'post-tiles' : 'post-rows'}`}>
      {posts.map((post, index) => (
        <motion.div
          key={post.slug}
          className={`post-entry tone-${index % 5}`}
          initial={
            reduceMotion
              ? false
              : {
                  opacity: 0,
                  x: view === 'tiles' ? 0 : 36,
                  y: view === 'tiles' ? 20 : 0,
                  rotateY: view === 'tiles' ? -12 : 0,
                }
          }
          whileInView={{ opacity: 1, x: 0, y: 0, rotateY: 0 }}
          viewport={{ once: true, amount: 0.08 }}
          transition={{ duration: 0.55, ease: motionEase, delay: Math.min(index % 6, 5) * 0.045 }}
        >
          <Link
            className="post-row"
            to={`/posts/${post.slug}${viewQuery}`}
            state={{ category: post.category }}
          >
            <span className="post-index-number">{String(index + 1).padStart(2, '0')}</span>
            <span className="post-category">{post.category}</span>
            <span className="post-copy">
              <strong>
                <BreakableTitle value={post.title} />
              </strong>
              <span>{post.description || post.excerpt}</span>
            </span>
            <time className="post-date" dateTime={post.publishedAt || undefined}>
              {formatDate(post.publishedAt)}
            </time>
            <span className="post-time">{post.readingMinutes} min</span>
            <span className="post-arrow" aria-hidden="true">
              <ArrowUpRight />
            </span>
          </Link>
        </motion.div>
      ))}
    </div>
  )
}

function LoadingRows() {
  return (
    <div className="post-list" aria-label="글 목록을 불러오는 중" aria-busy="true">
      {[0, 1, 2].map((item) => (
        <div className="post-row skeleton-row" key={item} aria-hidden="true">
          <span />
          <span />
          <span className="skeleton-copy" />
        </div>
      ))}
    </div>
  )
}

function ErrorState() {
  return (
    <div className="empty-state" role="alert">
      <p>기록을 불러오지 못했습니다.</p>
      <button type="button" onClick={() => window.location.reload()}>
        다시 시도하기
      </button>
    </div>
  )
}

function PostPage({ onCategoryChange }: { onCategoryChange: (category: string) => void }) {
  const reduceMotion = useReducedMotion()
  const { pathname, search } = useLocation()
  const indexUrl = collectionUrl(pathname, new URLSearchParams(search).get('view'))
  const { slug = '' } = useParams()
  const [post, setPost] = useState<PostDetail | null>(null)
  const [related, setRelated] = useState<PostSummary[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading')
  const { scrollYProgress } = useScroll()
  const progress = useSpring(scrollYProgress, { stiffness: 100, damping: 24, restDelta: 0.001 })

  usePageMetadata(
    post?.title || '기록을 불러오는 중',
    post?.description || 'Bonifacio Notes의 기술 기록.',
    Boolean(post),
  )

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setState('loading')
    void getPost(slug, controller.signal)
      .then((response) => {
        if (!active) return
        setPost(response.post)
        setRelated(response.related)
        onCategoryChange(response.post.category)
        setState('ready')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        if (active) setState(isNotFound(error) ? 'missing' : 'failed')
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [onCategoryChange, slug])

  if (state === 'loading') {
    return (
      <div className="article-state" aria-busy="true">
        <p className="eyebrow">Opening the archive</p>
        <h1>기록을 펼치는 중…</h1>
      </div>
    )
  }

  if (!post || state !== 'ready') {
    return (
      <div className="article-state">
        <p className="eyebrow">
          {state === 'missing' ? '404 / Missing note' : 'Archive unavailable'}
        </p>
        <h1>
          {state === 'missing' ? '이 기록은 아직 공개되지 않았습니다.' : '기록을 열지 못했습니다.'}
        </h1>
        <Link to={indexUrl}>목록으로 돌아가기</Link>
      </div>
    )
  }

  return (
    <>
      <motion.div
        className="reading-progress"
        style={{ scaleX: reduceMotion ? scrollYProgress : progress }}
      />
      <article className="article-page">
        <header className="article-header">
          <div className="article-header-inner">
            <div className="article-heading-row">
              <motion.h1
                initial={reduceMotion ? false : { opacity: 0, x: 80, rotateY: 35 }}
                animate={{ opacity: 1, x: 0, rotateY: 0 }}
                transition={{ duration: 0.7, ease: motionEase }}
              >
                <BreakableTitle value={post.title} />
              </motion.h1>
              <Link className="back-link" to={indexUrl}>
                <ArrowLeft size={17} aria-hidden="true" />
                Index
              </Link>
            </div>
            <p className="article-classification">
              <time dateTime={post.publishedAt || undefined}>
                {formatDate(post.publishedAt, true)}
              </time>
              <span>{post.readingMinutes} min read</span>
            </p>
            <p className="article-description">{post.description}</p>
          </div>
        </header>

        <div className="article-grid">
          <ArticleTableOfContents html={post.contentHtml} />
          <div className="article-content" dangerouslySetInnerHTML={{ __html: post.contentHtml }} />
        </div>

        <footer className="article-footer">
          <p className="eyebrow">End of note</p>
          <h2>여기까지 읽었습니다.</h2>
          <Link to={indexUrl}>
            다른 기록 펼치기
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </footer>

        {related.length > 0 ? (
          <section className="related-notes" aria-labelledby="related-title">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">Continue nearby</p>
                <h2 id="related-title">같은 분류의 기록</h2>
              </div>
            </div>
            <PostList posts={related} />
          </section>
        ) : null}
      </article>
    </>
  )
}

function ArticleTableOfContents({ html }: { html: string }) {
  const headings = useMemo(() => {
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    return [...parsed.querySelectorAll<HTMLHeadingElement>('h2[id], h3[id]')].map((heading) => ({
      id: heading.id,
      text: heading.textContent || heading.id,
      level: heading.tagName === 'H3' ? 3 : 2,
    }))
  }, [html])

  if (headings.length < 2) return <aside className="article-aside empty" aria-hidden="true" />
  return (
    <>
      <aside className="article-aside" aria-label="이 글의 목차">
        <p className="eyebrow">On this note</p>
        <ol>
          {headings.map((heading) => (
            <li className={heading.level === 3 ? 'is-subheading' : ''} key={heading.id}>
              <a href={`#${heading.id}`}>{heading.text}</a>
            </li>
          ))}
        </ol>
      </aside>
      <details className="article-toc-mobile">
        <summary>
          <span>이 글의 목차</span>
          <small>{headings.length} sections</small>
        </summary>
        <ol>
          {headings.map((heading) => (
            <li className={heading.level === 3 ? 'is-subheading' : ''} key={heading.id}>
              <a href={`#${heading.id}`}>{heading.text}</a>
            </li>
          ))}
        </ol>
      </details>
    </>
  )
}

function NotFoundPage() {
  usePageMetadata('404', '요청한 Bonifacio Notes 페이지를 찾을 수 없습니다.')
  return (
    <div className="article-state">
      <p className="eyebrow">404 / Off the index</p>
      <h1>이 페이지는 인덱스 밖에 있습니다.</h1>
      <Link to="/">홈으로 돌아가기</Link>
    </div>
  )
}

export default function App() {
  const location = useLocation()
  const reduceMotion = useReducedMotion()
  const meta = useMeta()
  const isArticle = location.pathname.startsWith('/posts/')
  const isReading = isArticle || location.pathname === '/notes'
  const [articleCategory, setArticleCategory] = useState<{
    pathname: string
    category: string
  } | null>(null)
  const onCategoryChange = useCallback(
    (category: string) => {
      setArticleCategory({ pathname: location.pathname, category })
    },
    [location.pathname],
  )
  const activeCategory = isArticle
    ? articleCategory?.pathname === location.pathname
      ? articleCategory.category
      : typeof location.state?.category === 'string'
        ? location.state.category
        : undefined
    : new URLSearchParams(location.search).get('category') || undefined
  const [searchOpen, setSearchOpen] = useState(false)
  const searchReturnFocusRef = useRef<HTMLElement | null>(null)
  const openSearch = useCallback(() => {
    const activeElement = document.activeElement
    searchReturnFocusRef.current =
      activeElement instanceof HTMLElement &&
      activeElement.matches(
        'a[href], button, input, textarea, select, summary, [tabindex]:not([tabindex="-1"])',
      )
        ? activeElement
        : document.querySelector<HTMLElement>('.search-trigger')
    setSearchOpen(true)
  }, [])
  const closeSearch = useCallback(() => {
    setSearchOpen(false)
  }, [])
  const restoreSearchFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      const returnTarget = searchReturnFocusRef.current
      if (returnTarget?.isConnected) returnTarget.focus({ preventScroll: true })
      searchReturnFocusRef.current = null
    })
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const isTyping =
        target instanceof HTMLElement &&
        target.matches('input, textarea, select, [contenteditable="true"]')
      const hasOpenDialog = document.querySelector('dialog[open]') !== null
      if (event.key === '/' && !isTyping && !hasOpenDialog) {
        event.preventDefault()
        openSearch()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [openSearch])

  return (
    <MotionConfig reducedMotion="user">
      <ScrollManager />
      <SiteChrome meta={meta} activeCategory={activeCategory} onSearch={openSearch}>
        {location.pathname === '/' || isReading ? (
          <div className={`site-masthead ${isReading ? 'article-masthead' : 'home-masthead'}`}>
            <PanoramaHeading isReading={isReading} />
            <HomeIntro meta={meta} onSearch={openSearch} visible={!isReading} />
          </div>
        ) : null}
        {isReading ? (
          <CategoryLinks
            categories={meta.categories}
            activeCategory={activeCategory}
            variant="reading"
          />
        ) : null}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={reduceMotion ? false : { opacity: 0, x: 32 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -24 }}
            transition={{ duration: reduceMotion ? 0 : 0.24, ease: motionEase }}
          >
            <Routes location={location}>
              <Route path="/" element={<NotesIndex meta={meta} />} />
              <Route path="/notes" element={<NotesIndex meta={meta} reading />} />
              <Route
                path="/posts/:slug"
                element={<PostPage onCategoryChange={onCategoryChange} />}
              />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </SiteChrome>
      <AnimatePresence onExitComplete={restoreSearchFocus}>
        {searchOpen ? <SearchDialog onClose={closeSearch} /> : null}
      </AnimatePresence>
    </MotionConfig>
  )
}
