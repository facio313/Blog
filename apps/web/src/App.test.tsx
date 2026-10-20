import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const summary = {
  slug: 'test-note',
  title: '테스트 기록',
  description: '검증을 위한 공개 기록입니다.',
  excerpt: '검증용 요약',
  category: 'Java',
  tags: ['test'],
  readingMinutes: 2,
  publishedAt: '2023-03-24T15:00:00.000Z',
}

const meta = {
  categories: [{ name: 'Java', count: 1 }],
  stats: { posts: 1, categories: 1, latestPublishedAt: summary.publishedAt },
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function LocationProbe() {
  const location = useLocation()
  return (
    <output aria-label="current-url" data-pathname={location.pathname}>
      {location.search}
      {location.hash}
    </output>
  )
}

function installFetchMock(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/blog/api/meta')) return jsonResponse(meta)
    if (url.includes('/blog/api/posts/test-note')) {
      return jsonResponse({
        post: {
          ...summary,
          contentHtml:
            '<h2 id="opening">첫 번째 절</h2><p>본문입니다.</p><h3 id="details">세부 절</h3><pre><code>const veryLongLine = "abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz";</code></pre><table><tbody><tr><td>넓은 표</td><td>두 번째 열</td></tr></tbody></table>',
          contentFormat: 'markdown',
          sourcePath: 'Java/test.md',
        },
        related: [],
      })
    }
    if (url.includes('/blog/api/posts/plain-note')) {
      return jsonResponse({
        post: {
          ...summary,
          slug: 'plain-note',
          title: '목차 없는 기록',
          contentHtml: '<h2 id="only">유일한 절</h2><p>짧은 본문입니다.</p>',
          contentFormat: 'markdown',
          sourcePath: 'Java/plain.md',
        },
        related: [],
      })
    }
    if (url.includes('/blog/api/posts')) {
      return jsonResponse({ items: [summary], total: 1, page: 1, limit: 50, pages: 1 })
    }
    return jsonResponse({ error: 'not_found' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Bonifacio Notes app', () => {
  it('loads the database-backed index and category counts', async () => {
    installFetchMock()
    render(
      <MemoryRouter basename="/blog/" initialEntries={['/blog/']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('link', { name: /테스트 기록/ })).toBeInTheDocument()
    expect(document.querySelector('.post-tiles')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '타일 보기' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('link', { name: 'Java 01' })).toHaveAttribute(
      'href',
      '/blog/?category=Java',
    )
    expect(screen.getByRole('link', { name: 'All notes' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '검색 열기' })).toBeInTheDocument()
    expect(screen.getByText('1 public notes')).toBeInTheDocument()
  })

  it('switches between list and tiles and retains the selected view when filtering', async () => {
    const fetchMock = installFetchMock()
    render(
      <MemoryRouter basename="/blog/" initialEntries={['/blog/#post-index']}>
        <App />
        <LocationProbe />
      </MemoryRouter>,
    )

    await screen.findByRole('link', { name: /테스트 기록/ })
    const intro = document.querySelector('.home-intro')
    const panorama = document.querySelector('.panorama-title')
    expect(document.querySelector('.post-tiles')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '목록 보기' }))
    expect(screen.getByLabelText('current-url')).toHaveTextContent('?view=list#post-index')
    expect(screen.getByRole('button', { name: '목록 보기' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await waitFor(() => expect(document.querySelector('.post-rows')).toBeInTheDocument())
    const category = screen.getByRole('link', { name: 'Java 01' })
    expect(category).toHaveAttribute('href', '/blog/?category=Java&view=list')
    const categoryNav = category.closest('nav')
    expect(screen.getByRole('heading', { name: 'collection.' })).toBeInTheDocument()
    vi.mocked(Element.prototype.scrollIntoView).mockClear()
    vi.mocked(window.scrollTo).mockClear()
    fireEvent.click(category)
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('category=Java'),
        expect.any(Object),
      ),
    )
    expect(screen.getByRole('button', { name: '목록 보기' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await waitFor(() => expect(document.querySelector('.post-rows')).toBeInTheDocument())
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
    expect(window.scrollTo).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Java 01' })).toBe(category)
    expect(screen.getByRole('heading', { name: 'Java' })).toBe(category.querySelector('span'))
    expect(screen.queryByRole('heading', { name: 'collection.' })).not.toBeInTheDocument()
    expect(category.closest('nav')).toBe(categoryNav)
    expect(screen.getByRole('link', { name: /테스트 기록/ })).toHaveAttribute(
      'href',
      '/blog/posts/test-note?view=list',
    )
    fireEvent.click(screen.getByRole('button', { name: '타일 보기' }))
    await waitFor(() => expect(document.querySelector('.post-tiles')).toBeInTheDocument())
    expect(screen.getByLabelText('current-url')).toHaveAttribute('data-pathname', '/')
    expect(screen.getByLabelText('current-url')).toHaveTextContent('?category=Java')
    expect(screen.getByLabelText('current-url').textContent).not.toContain('#')
    expect(screen.getByRole('link', { name: 'All notes' })).toHaveAttribute('href', '/blog/')
    expect(document.querySelector('.home-intro')).toBe(intro)
    expect(intro).toHaveAttribute('aria-hidden', 'false')
    expect(intro).not.toHaveAttribute('inert')
    expect(document.querySelector('.panorama-title')).toBe(panorama)
    expect(panorama).toHaveAttribute('data-section', 'notes')
    expect(screen.getByRole('link', { name: 'Java 01' })).toHaveAttribute('aria-current', 'page')

    fireEvent.click(screen.getByRole('link', { name: 'All notes' }))
    await screen.findByRole('heading', { name: 'collection.' })
    await waitFor(() => expect(document.querySelector('.post-tiles')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Java 01' })).toBe(category)
    expect(category).not.toHaveAttribute('aria-current')
    expect(screen.queryByRole('heading', { name: 'Java' })).not.toBeInTheDocument()
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  it.each(['tiles', 'list'])('restores %s mode from a shared URL', async (view) => {
    installFetchMock()
    render(
      <MemoryRouter basename="/blog/" initialEntries={[`/blog/?view=${view}&category=Java`]}>
        <App />
      </MemoryRouter>,
    )
    await screen.findByRole('link', { name: /테스트 기록/ })
    expect(
      document.querySelector(view === 'tiles' ? '.post-tiles' : '.post-rows'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: view === 'tiles' ? '타일 보기' : '목록 보기' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('link', { name: 'All notes' })).toHaveAttribute(
      'href',
      `/blog/?view=${view}`,
    )
  })

  it('opens search with the slash shortcut, queries the API, and closes with Escape', async () => {
    const fetchMock = installFetchMock()
    render(
      <MemoryRouter basename="/blog/" initialEntries={['/blog/']}>
        <App />
      </MemoryRouter>,
    )

    fireEvent.keyDown(window, { key: '/' })
    const input = await screen.findByRole('textbox', { name: '무엇을 다시 찾고 있나요?' })
    fireEvent.change(input, { target: { value: 'Java' } })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('q=Java'),
        expect.objectContaining({ headers: { Accept: 'application/json' } }),
      )
    })
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: '검색 열기' })).toHaveFocus())
  })

  it('returns focus to the hero search control after the dialog exit finishes', async () => {
    installFetchMock()
    render(
      <MemoryRouter basename="/blog/" initialEntries={['/blog/']}>
        <App />
      </MemoryRouter>,
    )

    const trigger = screen.getByRole('button', { name: 'search 다시 찾기' })
    trigger.focus()
    fireEvent.click(trigger)
    const input = await screen.findByRole('textbox', { name: '무엇을 다시 찾고 있나요?' })
    expect(input).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('renders a sanitized article route and clears the index OG image', async () => {
    installFetchMock()
    render(
      <MemoryRouter basename="/blog/" initialEntries={['/blog/posts/test-note']}>
        <App />
      </MemoryRouter>,
    )

    const masthead = document.querySelector('.article-masthead')
    expect(masthead?.querySelector('.hero-title')).toHaveTextContent('notes.')
    expect(masthead?.querySelector('.hero-subtitle')).toHaveTextContent('in motion')
    expect(masthead?.querySelector('.panorama-title')).toHaveAttribute('data-section', 'motion')
    const articleTitle = await screen.findByRole('heading', { name: '테스트 기록' })
    expect(articleTitle).toBeInTheDocument()
    expect(document.querySelector('.article-masthead')).toBe(masthead)
    expect(document.querySelector('.article-masthead h1')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Java' })).not.toBeInTheDocument()
    const categoryNav = document.querySelector('.article-category-nav')
    expect(masthead?.nextElementSibling).toBe(categoryNav)
    expect(categoryNav?.compareDocumentPosition(articleTitle)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    expect(screen.getByRole('link', { name: 'Java 01' })).toHaveAttribute(
      'href',
      '/blog/notes?category=Java',
    )
    expect(screen.getByRole('heading', { name: '첫 번째 절' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Java 01' })).toHaveAttribute('aria-current', 'page')
    const desktopToc = screen.getByRole('complementary', { name: '이 글의 목차' })
    expect(within(desktopToc).getByRole('link', { name: '첫 번째 절' })).toHaveAttribute(
      'href',
      '#opening',
    )
    const mobileToc = screen.getByText('이 글의 목차').closest('details')
    expect(mobileToc).not.toHaveAttribute('open')
    expect(mobileToc).toHaveTextContent('2 sections')
    expect(document.querySelector('.article-content pre')).toBeInTheDocument()
    expect(document.querySelector('.article-content table')).toBeInTheDocument()
    expect(document.title).toBe('테스트 기록 — Bonifacio Notes')
    expect(document.querySelector('meta[property="og:image"]')).toHaveAttribute('content', '')
  })

  it('keeps the reading frame while browsing categories, switching views, and reopening a post', async () => {
    const fetchMock = installFetchMock()
    render(
      <MemoryRouter basename="/blog/" initialEntries={['/blog/posts/test-note']}>
        <App />
        <LocationProbe />
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: '테스트 기록' })
    const panorama = document.querySelector('.panorama-title')
    const categoryNav = document.querySelector('.article-category-nav')
    vi.mocked(window.scrollTo).mockClear()
    vi.mocked(Element.prototype.scrollIntoView).mockClear()
    fireEvent.click(screen.getByRole('link', { name: 'Java 01' }))
    await screen.findByRole('link', { name: /테스트 기록/ })
    expect(screen.getByLabelText('current-url')).toHaveAttribute('data-pathname', '/notes')
    expect(screen.getByLabelText('current-url')).toHaveTextContent('?category=Java')
    expect(document.querySelector('.panorama-title')).toBe(panorama)
    expect(panorama).toHaveAttribute('data-section', 'motion')
    expect(document.querySelector('.article-category-nav')).toBe(categoryNav)
    expect(document.querySelector('.home-intro')).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelector('.post-tiles')).toBeInTheDocument()
    expect(window.scrollTo).not.toHaveBeenCalled()
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('category=Java'),
      expect.any(Object),
    )

    fireEvent.click(screen.getByRole('button', { name: '목록 보기' }))
    await waitFor(() => expect(document.querySelector('.post-rows')).toBeInTheDocument())
    expect(screen.getByLabelText('current-url')).toHaveTextContent('?category=Java&view=list')
    const articleLink = await screen.findByRole('link', { name: /테스트 기록/ })
    expect(articleLink).toHaveAttribute('href', '/blog/posts/test-note?view=list')
    fireEvent.click(articleLink)
    await screen.findByRole('heading', { name: '테스트 기록' })
    expect(document.querySelector('.article-category-nav')).toBe(categoryNav)
    expect(document.querySelector('.panorama-title')).toBe(panorama)
    expect(screen.getByRole('link', { name: 'Java 01' })).toHaveAttribute(
      'href',
      '/blog/notes?category=Java&view=list',
    )
    fireEvent.click(screen.getByRole('link', { name: 'Index' }))
    await screen.findByRole('link', { name: /테스트 기록/ })
    expect(screen.getByLabelText('current-url')).toHaveAttribute('data-pathname', '/notes')
    expect(document.querySelector('.post-rows')).toBeInTheDocument()
    expect(document.querySelector('.home-intro')).toHaveAttribute('aria-hidden', 'true')

    vi.stubGlobal('pageYOffset', 420)
    vi.mocked(window.scrollTo).mockClear()
    fireEvent.click(screen.getByRole('link', { name: 'All notes' }))
    await waitFor(() =>
      expect(document.querySelector('.home-intro')).toHaveAttribute('aria-hidden', 'false'),
    )
    await screen.findByRole('link', { name: 'All notes' })
    await screen.findByRole('link', { name: /테스트 기록/ })
    expect(screen.getByLabelText('current-url')).toHaveAttribute('data-pathname', '/')
    expect(screen.getByLabelText('current-url')).toHaveTextContent('?view=list')
    expect(document.querySelector('.panorama-title')).toBe(panorama)
    expect(panorama).toHaveAttribute('data-section', 'notes')
    expect(document.querySelector('.post-rows')).toBeInTheDocument()
    // Framer Motion can restore the current offset while measuring the expanding intro.
    for (const call of vi.mocked(window.scrollTo).mock.calls) {
      expect(call).toEqual([0, 420])
    }
    expect(screen.getByRole('heading', { name: 'collection.' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'All notes' })).toHaveAttribute('aria-current', 'page')
  })

  it('keeps the selected category promoted while a different article is loading', async () => {
    const fetchMock = installFetchMock()
    const originalFetch = fetchMock.getMockImplementation()!
    const gitSummary = { ...summary, slug: 'git-note', title: 'Git 기록', category: 'Git' }
    let resolvePost!: (response: Response) => void
    const pendingPost = new Promise<Response>((resolve) => {
      resolvePost = resolve
    })
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/blog/api/meta')) {
        return Promise.resolve(
          jsonResponse({
            ...meta,
            categories: [...meta.categories, { name: 'Git', count: 1 }],
          }),
        )
      }
      if (url.includes('/blog/api/posts/git-note')) return pendingPost
      if (url.includes('category=Git')) {
        return Promise.resolve(
          jsonResponse({ items: [gitSummary], total: 1, page: 1, limit: 50, pages: 1 }),
        )
      }
      return originalFetch(input)
    })
    render(
      <MemoryRouter basename="/blog/" initialEntries={['/blog/posts/test-note']}>
        <App />
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: '테스트 기록' })
    const category = screen.getByRole('link', { name: 'Git 01' })
    const categoryNav = category.closest('nav')
    fireEvent.click(category)
    const articleLink = await screen.findByRole('link', { name: /Git 기록/ })
    expect(category).toHaveClass('is-promoted')

    fireEvent.click(articleLink)
    expect(screen.getByRole('link', { name: 'Git 01' })).toBe(category)
    expect(category).toHaveAttribute('aria-current', 'page')
    expect(category).toHaveClass('is-promoted')
    await screen.findByRole('heading', { name: '기록을 펼치는 중…' })
    expect(category).toHaveClass('is-promoted')
    expect(screen.queryByRole('heading', { name: 'collection.' })).not.toBeInTheDocument()

    await act(async () => {
      resolvePost(
        jsonResponse({
          post: {
            ...gitSummary,
            contentHtml: '<p>Git 본문</p>',
            contentFormat: 'markdown',
            sourcePath: 'Git/test.md',
          },
          related: [],
        }),
      )
    })
    await screen.findByRole('heading', { name: 'Git 기록' })
    expect(screen.getByRole('link', { name: 'Git 01' })).toBe(category)
    expect(category.closest('nav')).toBe(categoryNav)
    expect(category).toHaveClass('is-promoted')
    expect(category).toHaveAttribute('aria-current', 'page')
  })

  it('opens a reading collection directly with its category and list preference', async () => {
    installFetchMock()
    render(
      <MemoryRouter basename="/blog/" initialEntries={['/blog/notes?category=Java&view=list']}>
        <App />
      </MemoryRouter>,
    )

    await screen.findByRole('link', { name: /테스트 기록/ })
    expect(document.querySelector('.panorama-title')).toHaveAttribute('data-section', 'motion')
    expect(document.querySelector('.home-intro')).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelector('.post-rows')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Java 01' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '목록 보기' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('slides the same ordered panorama between home and an article without remounting it', async () => {
    installFetchMock()
    const offset = vi
      .spyOn(HTMLElement.prototype, 'offsetLeft', 'get')
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains('hero-subtitle')) return 240
        return this.classList.contains('hero-title-tail') ? 160 : 0
      })
    const width = vi
      .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
      .mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains('hero-subtitle')) return 200
        return this.classList.contains('hero-title-tail') ? 40 : 0
      })
    const viewport = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('hero-copy') ? 300 : 0
      })

    try {
      render(
        <MemoryRouter basename="/blog/" initialEntries={['/blog/']}>
          <App />
        </MemoryRouter>,
      )

      const articleLink = await screen.findByRole('link', { name: /테스트 기록/ })
      const track = document.querySelector<HTMLElement>('.panorama-title')!
      const intro = document.querySelector<HTMLElement>('.home-intro')!
      const hero = document.querySelector<HTMLElement>('.hero')!
      const labels = [...track.children]
      expect(labels.map((label) => label.textContent)).toEqual(['notes.', 'in motion'])
      expect(screen.getByRole('heading', { name: 'notes. in motion' })).toBe(track)
      expect(intro).not.toHaveAttribute('inert')

      fireEvent.click(articleLink)
      await screen.findByRole('heading', { name: '테스트 기록' })
      expect(document.querySelector('.panorama-title')).toBe(track)
      expect([...track.children]).toEqual(labels)
      expect(track).not.toHaveAttribute('role', 'heading')
      expect(document.querySelector('.home-intro')).toBe(intro)
      expect(document.querySelector('.hero')).toBe(hero)
      expect(intro).toHaveAttribute('aria-hidden', 'true')
      expect(intro).toHaveAttribute('inert')
      expect(screen.queryByRole('button', { name: 'search 다시 찾기' })).not.toBeInTheDocument()
      await waitFor(() => expect(hero.style.transform).toBe('translateY(-100%)'))
      expect(intro).toHaveStyle({ height: '0px' })
      await waitFor(() => expect(track.style.transform).toBe('translateX(-180px)'))

      fireEvent.click(screen.getByRole('button', { name: 'Index' }))
      const dialog = await screen.findByRole('dialog', { name: '모바일 블로그 인덱스' })
      expect(within(dialog).getByRole('link', { name: 'Java 01' })).toHaveAttribute(
        'aria-current',
        'page',
      )
      fireEvent.click(screen.getByRole('button', { name: '인덱스 닫기' }))
      await waitFor(() => expect(dialog).not.toBeInTheDocument())

      fireEvent.click(screen.getByRole('link', { name: 'All notes' }))
      await screen.findByRole('link', { name: /테스트 기록/ })
      expect(document.querySelector('.panorama-title')).toBe(track)
      expect([...track.children]).toEqual(labels)
      expect(screen.getByRole('heading', { name: 'notes. in motion' })).toBe(track)
      expect(document.querySelector('.hero')).toBe(hero)
      expect(intro).toHaveAttribute('aria-hidden', 'false')
      expect(intro).not.toHaveAttribute('inert')
      expect(screen.getByRole('button', { name: 'search 다시 찾기' })).toBeInTheDocument()
      await waitFor(() => expect(hero.style.transform).toBe('none'))
      expect(intro).toHaveStyle({ height: 'auto' })
      await waitFor(() => expect(track.style.transform).toBe('none'))
    } finally {
      offset.mockRestore()
      width.mockRestore()
      viewport.mockRestore()
    }
  })

  it('does not render a mobile disclosure for an article without a useful table of contents', async () => {
    installFetchMock()
    render(
      <MemoryRouter basename="/blog/" initialEntries={['/blog/posts/plain-note']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '목차 없는 기록' })).toBeInTheDocument()
    const emptyAside = document.querySelector('.article-aside.empty')
    expect(emptyAside).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelector('.article-toc-mobile')).not.toBeInTheDocument()
  })

  it('opens and closes the accessible mobile index', async () => {
    installFetchMock()
    render(
      <MemoryRouter basename="/blog/" initialEntries={['/blog/']}>
        <App />
      </MemoryRouter>,
    )

    const trigger = screen.getByRole('button', { name: 'Index' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: '모바일 블로그 인덱스' })
    expect(dialog).toHaveAttribute('open')
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(within(dialog).getByRole('link', { name: 'All notes' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(dialog).getByRole('link', { name: 'Java 01' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: '/' })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '인덱스 닫기' }))
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
