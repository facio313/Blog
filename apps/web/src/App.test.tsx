import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
      <MemoryRouter basename="/blog" initialEntries={['/blog/']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('link', { name: /테스트 기록/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Java 01' })).toHaveAttribute(
      'href',
      '/blog?category=Java#post-index',
    )
    expect(screen.getByRole('link', { name: 'All notes' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '검색 열기' })).toBeInTheDocument()
    const portfolioLink = screen.getByRole('link', { name: '← Bonifacio' })
    expect(portfolioLink).toHaveAttribute('href', 'https://bonifacio.work/')
    expect(portfolioLink).not.toHaveAttribute('target')
    expect(screen.getByText('1 public notes')).toBeInTheDocument()
  })

  it('opens search with the slash shortcut, queries the API, and closes with Escape', async () => {
    const fetchMock = installFetchMock()
    render(
      <MemoryRouter basename="/blog" initialEntries={['/blog/']}>
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

  it('renders a sanitized article route and clears the index OG image', async () => {
    installFetchMock()
    render(
      <MemoryRouter basename="/blog" initialEntries={['/blog/posts/test-note']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: '테스트 기록' })).toBeInTheDocument()
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

  it('does not render a mobile disclosure for an article without a useful table of contents', async () => {
    installFetchMock()
    render(
      <MemoryRouter basename="/blog" initialEntries={['/blog/posts/plain-note']}>
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
      <MemoryRouter basename="/blog" initialEntries={['/blog/']}>
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
