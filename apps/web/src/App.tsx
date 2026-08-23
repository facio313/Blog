import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring } from 'framer-motion'
import { ArrowDownRight, ArrowLeft, ArrowUpRight, Menu, Search, X } from 'lucide-react'
import {
  Fragment,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { getMeta, getPost, getPosts, isNotFound } from './api'
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
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      window.requestAnimationFrame(() => document.querySelector(hash)?.scrollIntoView())
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
  }, [hash, pathname])
  return null
}

interface ChromeProps {
  children: ReactNode
  meta: MetaResponse
  activeCategory?: string | undefined
  onSearch: () => void
}

function SiteChrome({ children, meta, activeCategory, onSearch }: ChromeProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const mobileTriggerRef = useRef<HTMLButtonElement>(null)
  const closeMobile = useCallback(() => {
    setMobileOpen(false)
    window.setTimeout(() => mobileTriggerRef.current?.focus(), 460)
  }, [])

  return (
    <div className="site-shell">
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>
      <div className="ambient-grid" aria-hidden="true" />
      <motion.div
        className="ambient-orb"
        aria-hidden="true"
        animate={reduceMotion ? {} : { x: [0, 28, -10, 0], y: [0, -20, 18, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />

      <aside className="index-rail" aria-label="블로그 인덱스">
        <Link className="wordmark" to="/" aria-label="Bonifacio Notes 홈">
          <span className="wordmark-dot" aria-hidden="true" />
          B/Notes
        </Link>
        <button
          ref={mobileTriggerRef}
          className="mobile-menu-trigger"
          type="button"
          aria-expanded={mobileOpen}
          aria-controls="mobile-index"
          onClick={() => setMobileOpen(true)}
        >
          <span>Index</span>
          <Menu size={19} aria-hidden="true" />
        </button>

        <div className="rail-block rail-intro">
          <p className="eyebrow">A field index since 2022</p>
          <p>
            배운 것, 만든 것,
            <br />
            잊기 전에 적어 둔 것.
          </p>
        </div>

        <CategoryLinks
          categories={meta.categories}
          activeCategory={activeCategory}
          className="category-nav"
        />

        <div className="rail-footer">
          <span>{meta.stats.posts} public notes</span>
          <span>Seoul · KST</span>
        </div>
      </aside>

      <main id="main-content">
        <UtilityBar onSearch={onSearch} />
        {children}
      </main>

      <AnimatePresence>
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
      <span>Bonifacio / Independent blog</span>
      <button className="search-trigger" type="button" aria-label="검색 열기" onClick={onSearch}>
        <Search size={16} strokeWidth={1.8} aria-hidden="true" />
        <span>Search</span>
        <kbd>/</kbd>
      </button>
    </div>
  )
}

function CategoryLinks({
  categories,
  activeCategory,
  className,
  onSelect,
}: {
  categories: MetaResponse['categories']
  activeCategory?: string | undefined
  className: string
  onSelect?: (() => void) | undefined
}) {
  return (
    <nav className={className} aria-label="카테고리">
      <Link
        className={!activeCategory ? 'is-active' : ''}
        to="/#post-index"
        aria-current={!activeCategory ? 'page' : undefined}
        onClick={onSelect}
      >
        <span aria-hidden="true">↳</span>
        <span>All notes</span>
      </Link>
      {categories.map((category) => (
        <Link
          className={activeCategory === category.name ? 'is-active' : ''}
          to={`/?category=${encodeURIComponent(category.name)}#post-index`}
          aria-current={activeCategory === category.name ? 'page' : undefined}
          onClick={onSelect}
          key={category.name}
        >
          <span aria-hidden="true">↳</span>
          <span>{category.name}</span>
          <small>{String(category.count).padStart(2, '0')}</small>
        </Link>
      ))}
    </nav>
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
      initial={{ y: '-100%' }}
      animate={{ y: 0 }}
      exit={{ y: '-100%' }}
      transition={{ duration: 0.42, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <div className="mobile-index-head">
        <span>B/Notes · Index</span>
        <button type="button" onClick={onClose} aria-label="인덱스 닫기" autoFocus>
          <X aria-hidden="true" />
        </button>
      </div>
      <CategoryLinks
        categories={categories}
        activeCategory={activeCategory}
        className="mobile-category-nav"
        onSelect={onClose}
      />
      <p className="mobile-index-note">Field notes from Seoul · Since 2022</p>
    </motion.dialog>
  )
}

function SearchDialog({ onClose }: { onClose: () => void }) {
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
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.985 }}
      >
        <header>
          <p className="eyebrow">Find a note</p>
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
              <Link to={`/posts/${post.slug}`} onClick={onClose} key={post.slug}>
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

function HomePage({ meta, onSearch }: { meta: MetaResponse; onSearch: () => void }) {
  const reduceMotion = useReducedMotion()
  const [searchParams] = useSearchParams()
  const category = searchParams.get('category') || undefined
  const [posts, setPosts] = useState<PostSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const currentTitle = category ? `${category} 기록` : '최근 기록'

  usePageMetadata(
    'Bonifacio Notes',
    '개발하며 배운 것, 만든 것, 잊기 전에 적어 둔 것을 다시 읽을 수 있게 정리한 기술 블로그.',
  )

  useEffect(() => {
    const controller = new AbortController()
    let active = true
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

  return (
    <SiteChrome meta={meta} activeCategory={category} onSearch={onSearch}>
      <header className="hero">
        <div className="hero-copy">
          <motion.p
            className="hero-kicker"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            Technical notes · learning archive · occasional detours
          </motion.p>
          <motion.h1
            initial={reduceMotion ? false : { opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
          >
            기억은
            <br />
            <span>정리될 때</span>
            <br />
            비로소 내 것이 된다.
          </motion.h1>
        </div>
        <div className="hero-meta">
          <p>개발하며 만난 개념과 시행착오를 한 편씩 다시 읽을 수 있는 기록으로 만듭니다.</p>
          <a href="#post-index">
            최근 기록 보기
            <ArrowDownRight size={20} aria-hidden="true" />
          </a>
        </div>
      </header>

      <section className="post-index" id="post-index" aria-labelledby="post-index-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Recently catalogued</p>
            <h2 id="post-index-title">{currentTitle}</h2>
          </div>
          <p>{loading ? 'Loading' : `${posts.length} notes · newest → oldest`}</p>
        </div>

        {failed ? (
          <ErrorState />
        ) : loading ? (
          <LoadingRows />
        ) : posts.length > 0 ? (
          <PostList posts={posts} />
        ) : (
          <div className="empty-state">
            <p>이 분류에는 공개된 기록이 아직 없습니다.</p>
            <Link to="/#post-index">모든 기록으로 돌아가기</Link>
          </div>
        )}
      </section>
    </SiteChrome>
  )
}

function PostList({ posts }: { posts: PostSummary[] }) {
  const reduceMotion = useReducedMotion()
  return (
    <div className="post-list">
      {posts.map((post, index) => (
        <motion.div
          key={post.slug}
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ delay: Math.min(index, 8) * 0.045 }}
        >
          <Link className="post-row" to={`/posts/${post.slug}`}>
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

function PostPage({ meta, onSearch }: { meta: MetaResponse; onSearch: () => void }) {
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
  }, [slug])

  if (state === 'loading') {
    return (
      <SiteChrome meta={meta} onSearch={onSearch}>
        <div className="article-state" aria-busy="true">
          <p className="eyebrow">Opening the archive</p>
          <h1>기록을 펼치는 중…</h1>
        </div>
      </SiteChrome>
    )
  }

  if (!post || state !== 'ready') {
    return (
      <SiteChrome meta={meta} onSearch={onSearch}>
        <div className="article-state">
          <p className="eyebrow">
            {state === 'missing' ? '404 / Missing note' : 'Archive unavailable'}
          </p>
          <h1>
            {state === 'missing'
              ? '이 기록은 아직 공개되지 않았습니다.'
              : '기록을 열지 못했습니다.'}
          </h1>
          <Link to="/">목록으로 돌아가기</Link>
        </div>
      </SiteChrome>
    )
  }

  return (
    <SiteChrome meta={meta} activeCategory={post.category} onSearch={onSearch}>
      <motion.div className="reading-progress" style={{ scaleX: progress }} />
      <article className="article-page">
        <header className="article-header">
          <div className="article-header-inner">
            <Link className="back-link" to="/#post-index">
              <ArrowLeft size={17} aria-hidden="true" />
              Index
            </Link>
            <p className="article-classification">
              <span>{post.category}</span>
              <time dateTime={post.publishedAt || undefined}>
                {formatDate(post.publishedAt, true)}
              </time>
              <span>{post.readingMinutes} min read</span>
            </p>
            <h1>
              <BreakableTitle value={post.title} />
            </h1>
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
          <Link to="/#post-index">
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
    </SiteChrome>
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

function NotFoundPage({ meta, onSearch }: { meta: MetaResponse; onSearch: () => void }) {
  usePageMetadata('404', '요청한 Bonifacio Notes 페이지를 찾을 수 없습니다.')
  return (
    <SiteChrome meta={meta} onSearch={onSearch}>
      <div className="article-state">
        <p className="eyebrow">404 / Off the index</p>
        <h1>이 페이지는 인덱스 밖에 있습니다.</h1>
        <Link to="/">홈으로 돌아가기</Link>
      </div>
    </SiteChrome>
  )
}

export default function App() {
  const meta = useMeta()
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
    const returnTarget = searchReturnFocusRef.current
    setSearchOpen(false)
    window.setTimeout(() => {
      if (returnTarget?.isConnected) returnTarget.focus()
      searchReturnFocusRef.current = null
    }, 460)
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
    <>
      <ScrollManager />
      <Routes>
        <Route path="/" element={<HomePage meta={meta} onSearch={openSearch} />} />
        <Route path="/posts/:slug" element={<PostPage meta={meta} onSearch={openSearch} />} />
        <Route path="*" element={<NotFoundPage meta={meta} onSearch={openSearch} />} />
      </Routes>
      <AnimatePresence>
        {searchOpen ? <SearchDialog onClose={closeSearch} /> : null}
      </AnimatePresence>
    </>
  )
}
