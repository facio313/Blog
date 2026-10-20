import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  createMemoryRouter,
  Link,
  Route,
  RouterProvider,
  Routes,
  useLocation,
} from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthorEditor } from './AuthorEditor'
import { AuthorSessionProvider } from './AuthorSession'
import type { AuthorPost } from './author-api'

const csrfToken = 'test-csrf'
const initialPost: AuthorPost = {
  id: 'note-1',
  slug: 'existing-note',
  title: '기존 공개 글',
  description: '소개',
  category: 'Java',
  tags: ['test'],
  contentRaw: '## 원래 본문\n\n공개된 내용.',
  status: 'published',
  hasDraft: false,
  version: 7,
  updatedAt: '2026-10-20T01:30:00.000Z',
  publishedAt: '2026-10-19T01:30:00.000Z',
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setup({
  path = '/write',
  sessionStatus = 200,
  failure,
}: {
  path?: string
  sessionStatus?: number
  failure?: { status: number; error: string }
} = {}) {
  // jsdom supplies DOM signals, while React Router's Request uses Node's fetch implementation.
  vi.stubGlobal('AbortController', transferableAbortController().constructor)
  let stored = { ...initialPost }
  let saveFailure = failure
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url.endsWith('/author/session')) {
      return sessionStatus === 200
        ? json({ user: 'cks', csrfToken })
        : json(
            { error: sessionStatus === 401 ? 'login_required' : 'author_forbidden' },
            sessionStatus,
          )
    }
    if (url.endsWith('/author/posts') && method === 'GET') {
      return json({ items: [{ ...stored, contentFormat: 'markdown' }] })
    }
    if (url.includes('/author/posts/') && method === 'GET') return json({ post: stored })
    const payload = JSON.parse(String(init?.body)) as Record<string, unknown>
    if (url.endsWith('/author/preview')) {
      return json({ contentHtml: `<h2>미리보기 결과</h2><p>${String(payload.contentRaw)}</p>` })
    }
    if (url.endsWith('/author/import')) {
      return json({
        title: '가져온 제목',
        description: '파일 소개',
        category: 'Markdown',
        tags: ['파일', '테스트'],
        contentRaw: '## 파일에서 온 본문\n\n원문 그대로.',
      })
    }
    if (url.includes('/author/posts') && (method === 'POST' || method === 'PUT')) {
      if (saveFailure) return json({ error: saveFailure.error }, saveFailure.status)
      stored = {
        ...stored,
        title: String(payload.title || '제목 없는 글'),
        description: String(payload.description),
        category: String(payload.category || 'Notes'),
        tags: payload.tags as string[],
        contentRaw: String(payload.contentRaw),
        version: method === 'POST' ? 1 : stored.version + 1,
        status:
          payload.action === 'publish' ? 'published' : method === 'POST' ? 'draft' : stored.status,
        hasDraft: payload.action !== 'publish',
      }
      return json({ post: stored }, method === 'POST' ? 201 : 200)
    }
    return json({ error: 'not_found' }, 404)
  })
  vi.stubGlobal('fetch', fetchMock)
  const published = vi.fn()
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <AuthorSessionProvider>
            <Routes>
              <Route path="/write" element={<AuthorEditor onPublished={published} />} />
              <Route path="/" element={<p>공개 기록 목록</p>} />
            </Routes>
            <Link to="/">목록으로</Link>
            <LocationProbe />
          </AuthorSessionProvider>
        ),
      },
    ],
    { basename: '/blog/', initialEntries: ['/blog/', `/blog${path}`], initialIndex: 1 },
  )
  render(<RouterProvider router={router} />)
  return {
    router,
    fetchMock,
    published,
    setFailure(value: typeof saveFailure) {
      saveFailure = value
    },
    setStored(value: AuthorPost) {
      stored = value
    },
  }
}

function LocationProbe() {
  const location = useLocation()
  return (
    <output aria-label="현재 경로">
      {location.pathname}
      {location.search}
    </output>
  )
}

async function writeFields() {
  const title = await screen.findByLabelText('제목')
  fireEvent.change(title, { target: { value: '새 Markdown 기록' } })
  fireEvent.change(screen.getByLabelText('Markdown'), {
    target: { value: '## 첫 문장\n\n기록한 본문.' },
  })
}

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.readAsText(blob)
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Markdown writing room', () => {
  it.each([401, 403])(
    'requires the author session before exposing editing controls (%i)',
    async (status) => {
      const { fetchMock } = setup({ sessionStatus: status })
      expect(await screen.findByRole('link', { name: /Bonifacio로 로그인/ })).toHaveAttribute(
        'href',
        `/sso/?rd=${encodeURIComponent(`${window.location.origin}/blog/write`)}`,
      )
      expect(screen.queryByLabelText('Markdown')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '발행' })).not.toBeInTheDocument()
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

  it('previews through the shared renderer, creates a draft, and saves again with its version', async () => {
    const { fetchMock, published } = setup()
    await writeFields()
    expect(await screen.findByRole('heading', { name: '미리보기 결과' })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/blog/api/author/preview',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-CSRF-Token': csrfToken }),
        body: JSON.stringify({ contentRaw: '## 첫 문장\n\n기록한 본문.' }),
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }))
    expect(await screen.findByText('초안을 저장했습니다.')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByLabelText('현재 경로')).toHaveTextContent('/write?id=note-1'),
    )
    expect(published).not.toHaveBeenCalled()
    const create = fetchMock.mock.calls.find(
      ([url, options]) => String(url).endsWith('/author/posts') && options?.method === 'POST',
    )
    expect(JSON.parse(String(create?.[1]?.body))).toMatchObject({
      title: '새 Markdown 기록',
      contentRaw: '## 첫 문장\n\n기록한 본문.',
      action: 'draft',
    })
    fireEvent.change(screen.getByLabelText('Markdown'), { target: { value: '두 번째 저장' } })
    fireEvent.keyDown(window, { key: 's', metaKey: true })
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/blog/api/author/posts/note-1',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"version":1'),
        }),
      ),
    )
    expect(screen.getByLabelText('Markdown')).toHaveValue('두 번째 저장')
  })

  it('loads an existing post by slug and separates its private draft from publication', async () => {
    const { fetchMock, published } = setup({ path: '/write?slug=existing-note' })
    expect(await screen.findByLabelText('제목')).toHaveValue(initialPost.title)
    fireEvent.change(screen.getByLabelText('Markdown'), {
      target: { value: '아직 공개하지 않을 수정' },
    })
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }))
    expect(await screen.findByText(/수정 내용을 초안으로 저장했습니다/)).toBeInTheDocument()
    expect(screen.getByText('발행됨 · 수정 초안')).toBeInTheDocument()
    expect(published).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(
      '/blog/api/author/posts/note-1',
      expect.objectContaining({ method: 'PUT', body: expect.stringContaining('"version":7') }),
    )
    fireEvent.click(screen.getByRole('button', { name: '수정 내용 발행' }))
    expect(await screen.findByText('글을 발행했습니다.')).toBeInTheDocument()
    expect(published).toHaveBeenCalledTimes(1)
    const updates = fetchMock.mock.calls.filter(([, options]) => options?.method === 'PUT')
    expect(JSON.parse(String(updates[1]?.[1]?.body))).toMatchObject({
      action: 'publish',
      version: 8,
      contentRaw: '아직 공개하지 않을 수정',
    })
  })

  it('imports a Markdown file as unsaved inputs without publishing its frontmatter', async () => {
    const { fetchMock } = setup()
    await screen.findByLabelText('제목')
    const fileText =
      '---\ntitle: 가져온 제목\npublished: true\n---\n\n## 파일에서 온 본문\n\n원문 그대로.'
    const file = new File([fileText], 'my-note.md', { type: 'text/markdown' })
    fireEvent.change(screen.getByLabelText('Markdown 파일 선택'), { target: { files: [file] } })
    await waitFor(() => expect(screen.getByLabelText('제목')).toHaveValue('가져온 제목'))
    expect(screen.getByLabelText('Markdown')).toHaveValue('## 파일에서 온 본문\n\n원문 그대로.')
    expect(screen.getByLabelText(/태그/)).toHaveValue('파일, 테스트')
    expect(screen.getByText('저장하지 않은 변경사항')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/blog/api/author/import',
      expect.objectContaining({
        body: JSON.stringify({ filename: 'my-note.md', markdown: fileText }),
      }),
    )
    expect(
      fetchMock.mock.calls.filter(
        ([url, options]) => String(url).includes('/author/posts') && options?.method !== 'GET',
      ),
    ).toHaveLength(0)
  })

  it('exports the current unsaved source locally even after login expiry and network loss', async () => {
    const { fetchMock } = setup({ failure: { status: 401, error: 'login_required' } })
    await writeFields()
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: '인용: "제목"' } })
    fireEvent.change(screen.getByLabelText('Markdown'), {
      target: { value: '\n본문 원문\n\n```ts\nconst x = 1\n```\n' },
    })
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }))
    await screen.findByText(/로그인이 만료되었습니다/)
    fetchMock.mockRejectedValue(new TypeError('offline'))
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:markdown-download')
    const nativeUrl = URL
    vi.stubGlobal(
      'URL',
      class extends nativeUrl {
        static createObjectURL = createObjectURL
        static revokeObjectURL = vi.fn()
      },
    )
    const download = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)
    const callsBeforeExport = fetchMock.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: '.md 내보내기' }))
    expect(download).toHaveBeenCalledTimes(1)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const markdown = await readBlob(createObjectURL.mock.calls[0]![0] as Blob)
    expect(markdown).toContain('title: "인용: \\"제목\\""')
    expect(markdown).toContain('published: false')
    expect(markdown.replace(/^---\n[\s\S]*?\n---\n/u, '')).toBe(
      '\n본문 원문\n\n```ts\nconst x = 1\n```\n',
    )
    expect(fetchMock).toHaveBeenCalledTimes(callsBeforeExport)
    expect(screen.getByText('저장하지 않은 변경사항')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그인 상태 갱신' })).toBeInTheDocument()
  })

  it('keeps edits on conflict, blocks further writes, and reloads only after explicit confirmation', async () => {
    const { fetchMock, setStored } = setup({
      path: '/write?id=note-1',
      failure: { status: 409, error: 'edit_conflict' },
    })
    await screen.findByLabelText('Markdown')
    fireEvent.change(screen.getByLabelText('Markdown'), {
      target: { value: '내 창에서 작성한 중요한 내용' },
    })
    fireEvent.click(screen.getByRole('button', { name: '초안 저장' }))
    await screen.findByText(/다른 창에서 이 글을 변경했습니다/)
    expect(screen.getByLabelText('Markdown')).toHaveValue('내 창에서 작성한 중요한 내용')
    expect(screen.getByRole('button', { name: '초안 저장' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '수정 내용 발행' })).toBeDisabled()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    fireEvent.click(screen.getByRole('button', { name: '최신 버전 다시 불러오기' }))
    expect(
      fetchMock.mock.calls.filter(
        ([url, options]) => String(url).endsWith('/posts/note-1') && options?.method === 'GET',
      ),
    ).toHaveLength(1)
    expect(screen.getByLabelText('Markdown')).toHaveValue('내 창에서 작성한 중요한 내용')
    setStored({ ...initialPost, version: 8, contentRaw: '서버의 최신 내용' })
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: '최신 버전 다시 불러오기' }))
    await waitFor(() => expect(screen.getByLabelText('Markdown')).toHaveValue('서버의 최신 내용'))
    expect(screen.getByRole('button', { name: '초안 저장' })).toBeEnabled()
  })

  it('warns before leaving unsaved work and blocks empty publication', async () => {
    const { fetchMock } = setup()
    await screen.findByLabelText('제목')
    fireEvent.click(screen.getByRole('button', { name: '발행' }))
    expect(await screen.findByText(/발행하려면 제목과 Markdown 본문/)).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0)
    await writeFields()
    fireEvent.click(screen.getByRole('link', { name: '목록으로' }))
    expect(
      await screen.findByRole('dialog', { name: '저장하지 않은 기록이 있습니다.' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '계속 작성' }))
    expect(screen.getByLabelText('현재 경로')).toHaveTextContent('/write')
    const beforeUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(beforeUnload)
    expect(beforeUnload.defaultPrevented).toBe(true)
    expect(screen.getByLabelText('Markdown')).toHaveValue('## 첫 문장\n\n기록한 본문.')
  })

  it('cancels browser POP without losing edits and leaves only after confirmation', async () => {
    const { router } = setup()
    await writeFields()
    await act(async () => {
      await router.navigate(-1)
    })
    expect(
      await screen.findByRole('dialog', { name: '저장하지 않은 기록이 있습니다.' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/blog/write')
    fireEvent.click(screen.getByRole('button', { name: '계속 작성' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByLabelText('제목')).toHaveValue('새 Markdown 기록')
    expect(screen.getByLabelText('Markdown')).toHaveValue('## 첫 문장\n\n기록한 본문.')
    expect(router.state.location.pathname).toBe('/blog/write')
    await act(async () => {
      await router.navigate(-1)
    })
    await screen.findByRole('dialog', { name: '저장하지 않은 기록이 있습니다.' })
    fireEvent.click(screen.getByRole('button', { name: '변경사항 버리고 이동' }))
    expect(await screen.findByText('공개 기록 목록')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/blog/')
    expect(screen.queryByLabelText('Markdown')).not.toBeInTheDocument()
  })

  it('rejects unsupported file extensions before import', async () => {
    const { fetchMock } = setup()
    await screen.findByLabelText('제목')
    const file = new File(['# note'], 'note.markdown')
    fireEvent.change(screen.getByLabelText('Markdown 파일 선택'), { target: { files: [file] } })
    expect(await screen.findByText('.md 파일을 선택해 주세요.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/author/import'))).toBe(false)
  })

  it('rejects oversized files before sending their contents', async () => {
    const { fetchMock } = setup()
    await screen.findByLabelText('제목')
    const file = new File(['x'.repeat(512 * 1024 + 1)], 'oversized.md')
    fireEvent.change(screen.getByLabelText('Markdown 파일 선택'), { target: { files: [file] } })
    expect(
      await screen.findByText('Markdown 파일은 512KB 이하만 가져올 수 있습니다.'),
    ).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/author/import'))).toBe(false)
  })
})
import { transferableAbortController } from 'node:util'
