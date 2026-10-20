import { ArrowUpRight, Check, Download, FileText, PenLine, Plus, Upload } from 'lucide-react'
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AuthorApiError,
  authorErrorMessage,
  authorLoginUrl,
  getAuthorPost,
  getAuthorPosts,
  getAuthorSession,
  importMarkdown,
  markdownByteLimit,
  previewMarkdown,
  saveAuthorPost,
  type AuthorFields,
  type AuthorPost,
  type AuthorPostSummary,
  type AuthorSession,
} from './author-api'
import { useAuthorSession } from './AuthorSession'
import { AuthorNavigationGuard } from './AuthorNavigationGuard'
import './author.css'

interface EditorFields extends Omit<AuthorFields, 'tags'> {
  tags: string
}

const emptyFields: EditorFields = {
  title: '',
  description: '',
  category: 'Notes',
  tags: '',
  contentRaw: '',
}

function editableFields(fields: AuthorFields): EditorFields {
  return {
    title: fields.title,
    description: fields.description,
    category: fields.category,
    tags: fields.tags.join(', '),
    contentRaw: fields.contentRaw,
  }
}

function requestFields(fields: EditorFields): AuthorFields {
  return {
    ...fields,
    tags: [
      ...new Set(
        fields.tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ],
  }
}

function fieldError(fields: EditorFields, action: 'draft' | 'publish'): string | null {
  if (action === 'publish' && (!fields.title.trim() || !fields.contentRaw.trim())) {
    return '발행하려면 제목과 Markdown 본문을 작성해 주세요.'
  }
  if (new TextEncoder().encode(fields.contentRaw).byteLength > markdownByteLimit) {
    return 'Markdown 본문은 512KB 이하로 작성해 주세요.'
  }
  const { tags } = requestFields(fields)
  if (tags.length > 30 || tags.some((tag) => tag.length > 60)) {
    return '태그는 30개까지, 각 태그는 60자까지 입력할 수 있습니다.'
  }
  return null
}

function statusLabel(post: Pick<AuthorPost, 'status' | 'hasDraft'>): string {
  if (post.status === 'published') return post.hasDraft ? '발행됨 · 수정 초안' : '발행됨'
  return post.status === 'review' ? '검토 중' : '초안'
}

function savedTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('file_read_failed'))
    reader.readAsText(file)
  })
}

function downloadFile(filename: string, markdown: string): void {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  const revoke = URL.revokeObjectURL.bind(URL)
  window.setTimeout(() => revoke(url), 1000)
}

function downloadMarkdownFile(fields: EditorFields): void {
  const normalized = requestFields(fields)
  const metadata = [
    `title: ${JSON.stringify(normalized.title || '제목 없는 글')}`,
    `description: ${JSON.stringify(normalized.description)}`,
    `category: ${JSON.stringify(normalized.category || 'Notes')}`,
    `tags: ${JSON.stringify(normalized.tags)}`,
    'published: false',
  ]
  const filename =
    Array.from(
      normalized.title
        .normalize('NFKC')
        .replace(/[^\p{L}\p{N}._ -]/gu, '')
        .trim()
        .replace(/\s+/g, '-'),
    )
      .slice(0, 80)
      .join('') || 'untitled-note'
  downloadFile(`${filename}.md`, `---\n${metadata.join('\n')}\n---\n${fields.contentRaw}`)
}

export function AuthorEditor({ onPublished }: { onPublished: () => void }) {
  const auth = useAuthorSession()
  if (auth.status !== 'ready') {
    return (
      <section className="article-state author-access" aria-busy={auth.status === 'loading'}>
        <p className="eyebrow">bonifacio / the writing room</p>
        <h1>
          {auth.status === 'loading'
            ? '작업실을 여는 중…'
            : auth.status === 'anonymous'
              ? '기록은 여기서 시작합니다.'
              : auth.status === 'forbidden'
                ? '작성자만 들어올 수 있습니다.'
                : '작업실을 열지 못했습니다.'}
        </h1>
        <p>
          {auth.status === 'anonymous'
            ? 'Bonifacio의 cks 계정으로 로그인하면 Markdown 글을 작성하고 관리할 수 있습니다.'
            : auth.status === 'forbidden'
              ? '글 작성은 Bonifacio의 cks 계정에만 허용됩니다.'
              : auth.status === 'unavailable'
                ? '글 작성 서비스의 연결 상태를 확인한 뒤 다시 시도해 주세요.'
                : 'Bonifacio 로그인 상태를 확인하고 있습니다.'}
        </p>
        {auth.status === 'anonymous' || auth.status === 'forbidden' ? (
          <a href={authorLoginUrl()}>
            Bonifacio로 로그인 <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        ) : auth.status === 'unavailable' ? (
          <button className="author-button" type="button" onClick={() => window.location.reload()}>
            다시 시도하기
          </button>
        ) : null}
        <Link to="/">공개 기록으로 돌아가기</Link>
      </section>
    )
  }
  return <WritingRoom session={auth.session} onPublished={onPublished} />
}

function WritingRoom({
  session: initialSession,
  onPublished,
}: {
  session: AuthorSession
  onPublished: () => void
}) {
  const [params, setParams] = useSearchParams()
  const id = params.get('id')
  const slug = params.get('slug')
  const routeKey = id ? `id:${id}` : slug ? `slug:${slug}` : 'new'
  const routeRef = useRef(routeKey)
  routeRef.current = routeKey
  const loadedKeyRef = useRef<string | null>(routeKey === 'new' ? 'new' : null)
  const aliveRef = useRef(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const [session, setSession] = useState(initialSession)
  const [post, setPost] = useState<AuthorPost | null>(null)
  const [fields, setFields] = useState<EditorFields>(emptyFields)
  const [baseline, setBaseline] = useState(JSON.stringify(emptyFields))
  const [loading, setLoading] = useState(Boolean(id || slug))
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [conflict, setConflict] = useState(false)
  const [needsLogin, setNeedsLogin] = useState(false)
  const [busy, setBusy] = useState<'draft' | 'publish' | 'import' | 'reload' | null>(null)
  const busyRef = useRef(false)
  const [revision, setRevision] = useState(0)
  const [view, setView] = useState<'source' | 'split' | 'preview'>('split')
  const [preview, setPreview] = useState('')
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const dirty = JSON.stringify(fields) !== baseline
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  const applyPost = useCallback((next: AuthorPost) => {
    const nextFields = editableFields(next)
    dirtyRef.current = false
    setPost(next)
    setFields(nextFields)
    setBaseline(JSON.stringify(nextFields))
    setConflict(false)
    setError(null)
    setNeedsLogin(false)
  }, [])

  useEffect(() => {
    if (loadedKeyRef.current === routeKey) return
    const controller = new AbortController()
    setError(null)
    setLoadError(null)
    setNotice('')
    setConflict(false)
    setNeedsLogin(false)
    if (!id && !slug) {
      setPost(null)
      setFields(emptyFields)
      setBaseline(JSON.stringify(emptyFields))
      setLoading(false)
      loadedKeyRef.current = routeKey
      return
    }
    setLoading(true)
    void getAuthorPost(id ? { id } : { slug: slug! }, controller.signal)
      .then(({ post: next }) => {
        if (controller.signal.aborted) return
        applyPost(next)
        loadedKeyRef.current = routeKey
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setLoadError(authorErrorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [applyPost, id, routeKey, slug])

  useEffect(() => {
    const controller = new AbortController()
    setPreviewError(null)
    if (view === 'source' || loading || !fields.contentRaw.trim()) {
      setPreview('')
      setPreviewBusy(false)
      return
    }
    if (new TextEncoder().encode(fields.contentRaw).byteLength > markdownByteLimit) {
      setPreview('')
      setPreviewError('Markdown 본문은 512KB 이하로 작성해 주세요.')
      setPreviewBusy(false)
      return
    }
    setPreviewBusy(true)
    const timer = window.setTimeout(() => {
      void previewMarkdown(fields.contentRaw, session.csrfToken, controller.signal)
        .then(({ contentHtml }) => {
          if (!controller.signal.aborted) setPreview(contentHtml)
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) {
            setPreview('')
            setPreviewError(authorErrorMessage(cause))
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setPreviewBusy(false)
        })
    }, 350)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [fields.contentRaw, loading, session.csrfToken, view])

  const reportError = useCallback((cause: unknown) => {
    setError(authorErrorMessage(cause))
    if (cause instanceof AuthorApiError) {
      if (cause.code === 'edit_conflict') setConflict(true)
      if (cause.status === 401 || cause.status === 403) setNeedsLogin(true)
    }
  }, [])

  const save = useCallback(
    async (action: 'draft' | 'publish') => {
      if (busyRef.current || loading || loadError || conflict) return
      const validation = fieldError(fields, action)
      if (validation) {
        setError(validation)
        return
      }
      busyRef.current = true
      setBusy(action)
      setError(null)
      setNotice('')
      const requestedKey = routeKey
      const isCurrentPost = () =>
        aliveRef.current &&
        (routeRef.current === requestedKey ||
          (post !== null &&
            routeRef.current === `id:${post.id}` &&
            loadedKeyRef.current === routeRef.current))
      try {
        const { post: next } = await saveAuthorPost(requestFields(fields), action, session, post)
        if (action === 'publish') onPublished()
        if (!isCurrentPost()) return
        applyPost(next)
        setRevision((value) => value + 1)
        setNotice(
          action === 'publish'
            ? '글을 발행했습니다.'
            : next.status === 'published'
              ? '수정 내용을 초안으로 저장했습니다. 공개된 글은 발행할 때 바뀝니다.'
              : '초안을 저장했습니다.',
        )
        loadedKeyRef.current = `id:${next.id}`
        setParams({ id: next.id }, { replace: true })
      } catch (cause) {
        if (isCurrentPost()) reportError(cause)
      } finally {
        busyRef.current = false
        if (aliveRef.current) setBusy(null)
      }
    },
    [
      applyPost,
      conflict,
      fields,
      loadError,
      loading,
      onPublished,
      post,
      reportError,
      routeKey,
      session,
      setParams,
    ],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void save('draft')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [save])

  const update = (field: keyof EditorFields, value: string) => {
    setFields((current) => ({ ...current, [field]: value }))
    setNotice('')
  }

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busyRef.current) return
    if (!/\.md$/i.test(file.name)) {
      setError('.md 파일을 선택해 주세요.')
      return
    }
    if (file.size > markdownByteLimit) {
      setError('Markdown 파일은 512KB 이하만 가져올 수 있습니다.')
      return
    }
    if (
      (dirty || post) &&
      !window.confirm('현재 편집 중인 내용을 Markdown 파일 내용으로 바꿀까요?')
    )
      return
    busyRef.current = true
    setBusy('import')
    setError(null)
    const requestedKey = routeKey
    try {
      const imported = await importMarkdown(file.name, await readFile(file), session.csrfToken)
      if (!aliveRef.current || routeRef.current !== requestedKey) return
      setFields(editableFields(imported))
      setNotice(`${file.name} 파일을 불러왔습니다. 초안 저장 또는 발행을 눌러 반영해 주세요.`)
    } catch (cause) {
      if (aliveRef.current && routeRef.current === requestedKey) reportError(cause)
    } finally {
      busyRef.current = false
      if (aliveRef.current) setBusy(null)
    }
  }

  const exportFile = () => {
    try {
      downloadMarkdownFile(fields)
      setNotice('현재 입력한 내용을 .md 파일로 내보냈습니다. 서버 저장은 별도로 해 주세요.')
    } catch {
      setError(
        '파일을 다운로드하지 못했습니다. 브라우저의 다운로드 설정을 확인해 주세요. 입력한 내용은 유지됩니다.',
      )
    }
  }

  const reloadPost = async () => {
    if (!post || busyRef.current) return
    if (
      dirty &&
      !window.confirm(
        '현재 입력을 버리고 서버에 저장된 최신 버전을 불러올까요? 필요한 내용은 먼저 .md로 내보내 주세요.',
      )
    )
      return
    busyRef.current = true
    setBusy('reload')
    try {
      const { post: next } = await getAuthorPost({ id: post.id })
      applyPost(next)
      setNotice('최신 버전을 불러왔습니다.')
    } catch (cause) {
      reportError(cause)
    } finally {
      busyRef.current = false
      setBusy(null)
    }
  }

  const refreshSession = async () => {
    try {
      const next = await getAuthorSession(new AbortController().signal)
      setSession(next)
      setNeedsLogin(false)
      setError(null)
      setNotice('로그인 상태를 갱신했습니다. 다시 저장해 주세요.')
    } catch (cause) {
      reportError(cause)
    }
  }

  const newPost = () => {
    if (busyRef.current) return
    if (dirty && !window.confirm('저장하지 않은 변경사항을 버리고 새 글을 작성할까요?')) return
    dirtyRef.current = false
    if (routeKey === 'new') {
      setFields(emptyFields)
      setBaseline(JSON.stringify(emptyFields))
      setError(null)
      setNotice('')
      setConflict(false)
    } else {
      setParams({})
    }
  }

  return (
    <section className="writing-room" aria-labelledby="writing-title">
      <AuthorNavigationGuard dirtyRef={dirtyRef} />
      <header className="writing-header">
        <div>
          <p className="eyebrow">bonifacio / the writing room</p>
          <h1 id="writing-title">
            write<span className="accent">.</span>
          </h1>
          <p>배운 것, 만든 것, 잊기 전에 적어 둘 것.</p>
        </div>
        <div className="writing-identity">
          <span>
            <span className="author-dot" />
            {session.user}
          </span>
          <button className="back-link" type="button" disabled={Boolean(busy)} onClick={newPost}>
            <Plus size={16} aria-hidden="true" />새 글
          </button>
        </div>
      </header>

      <AuthorLibrary revision={revision} currentId={post?.id} />

      {loading ? (
        <div className="author-loading" aria-busy="true">
          글의 원문을 불러오는 중…
        </div>
      ) : loadError ? (
        <div className="author-notice is-error" role="alert">
          <p>{loadError}</p>
          <Link to="/write">새 글 작성으로 돌아가기</Link>
        </div>
      ) : (
        <>
          <div className="author-status-line">
            <span className="author-post-status">{post ? statusLabel(post) : '새 기록'}</span>
            <span className={dirty ? 'is-unsaved' : ''}>
              {dirty
                ? '저장하지 않은 변경사항'
                : post
                  ? `${savedTime(post.updatedAt)} 저장됨`
                  : '아직 저장하지 않았습니다'}
            </span>
            {post?.status === 'published' ? (
              <Link to={`/posts/${post.slug}`}>
                공개 글 보기 <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            ) : null}
          </div>

          <fieldset className="author-fields" disabled={Boolean(busy)}>
            <legend className="author-sr-only">글 정보</legend>
            <label className="author-title-field" htmlFor="author-title">
              <span>제목</span>
              <input
                id="author-title"
                value={fields.title}
                maxLength={200}
                placeholder="어떤 기록을 남길까요?"
                autoComplete="off"
                onChange={(event) => update('title', event.target.value)}
              />
            </label>
            <label className="author-description-field" htmlFor="author-description">
              <span>소개</span>
              <textarea
                id="author-description"
                value={fields.description}
                maxLength={1000}
                rows={2}
                placeholder="목록에서 보여 줄 짧은 소개"
                onChange={(event) => update('description', event.target.value)}
              />
            </label>
            <div className="author-meta-fields">
              <label htmlFor="author-category">
                <span>분류</span>
                <input
                  id="author-category"
                  value={fields.category}
                  maxLength={80}
                  placeholder="Notes"
                  onChange={(event) => update('category', event.target.value)}
                />
              </label>
              <label htmlFor="author-tags">
                <span>
                  태그 <small>쉼표로 구분</small>
                </span>
                <input
                  id="author-tags"
                  value={fields.tags}
                  placeholder="Markdown, 개발, 기록"
                  onChange={(event) => update('tags', event.target.value)}
                />
              </label>
            </div>
          </fieldset>

          <div className="author-editor-toolbar">
            <div className="author-view-switch" role="group" aria-label="에디터 보기 방식">
              {(
                [
                  ['source', '원문'],
                  ['split', '나란히'],
                  ['preview', '미리보기'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="author-file-actions">
              <input
                className="author-sr-only"
                ref={fileRef}
                type="file"
                accept=".md,text/markdown"
                aria-label="Markdown 파일 선택"
                disabled={Boolean(busy)}
                onChange={(event) => void importFile(event)}
              />
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={16} aria-hidden="true" />
                {busy === 'import' ? '불러오는 중…' : '.md 가져오기'}
              </button>
              <button type="button" onClick={exportFile}>
                <Download size={16} aria-hidden="true" />
                .md 내보내기
              </button>
            </div>
          </div>

          <div className={`author-editor-panes view-${view}`}>
            {view !== 'preview' ? (
              <div className="author-source-pane">
                <div className="author-pane-heading">
                  <label htmlFor="author-content">
                    <PenLine size={14} aria-hidden="true" />
                    Markdown
                  </label>
                  <span>{fields.contentRaw.length.toLocaleString('ko-KR')}자</span>
                </div>
                <textarea
                  id="author-content"
                  value={fields.contentRaw}
                  spellCheck={false}
                  disabled={Boolean(busy)}
                  placeholder={
                    '## 첫 번째 기록\n\nMarkdown으로 자유롭게 작성하세요.\n\n```ts\nconst note = "잊기 전에 기록하기"\n```'
                  }
                  onChange={(event) => update('contentRaw', event.target.value)}
                />
              </div>
            ) : null}
            {view !== 'source' ? (
              <section
                className="author-preview-pane"
                aria-label="글 미리보기"
                aria-busy={previewBusy}
              >
                <div className="author-pane-heading">
                  <span>
                    <FileText size={14} aria-hidden="true" />
                    Preview
                  </span>
                  <span>{previewBusy ? '업데이트 중…' : '게시글과 같은 서식'}</span>
                </div>
                <div className="author-preview-scroll">
                  {previewError ? (
                    <p className="author-preview-message" role="alert">
                      {previewError}
                    </p>
                  ) : preview ? (
                    <div
                      className="article-content"
                      dangerouslySetInnerHTML={{ __html: preview }}
                    />
                  ) : (
                    <p className="author-preview-message">
                      Markdown을 작성하면 여기에 미리보기가 나타납니다.
                    </p>
                  )}
                </div>
              </section>
            ) : null}
          </div>

          {error ? (
            <div className="author-notice is-error" role="alert">
              <p>{error}</p>
              {conflict ? (
                <button type="button" disabled={Boolean(busy)} onClick={() => void reloadPost()}>
                  최신 버전 다시 불러오기
                </button>
              ) : null}
              {needsLogin ? (
                <div className="author-recovery-actions">
                  <a href={authorLoginUrl()} target="_blank" rel="noopener noreferrer">
                    새 탭에서 로그인
                  </a>
                  <button type="button" onClick={() => void refreshSession()}>
                    로그인 상태 갱신
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          <p className="author-feedback" role="status">
            {notice ? (
              <>
                <Check size={15} aria-hidden="true" />
                {notice}
              </>
            ) : null}
          </p>
          <div className="author-save-bar">
            <p>
              {post?.status === 'published'
                ? '초안 저장은 공개된 글에 영향을 주지 않습니다. 발행하면 수정 내용이 공개됩니다.'
                : '초안은 나만 볼 수 있습니다. 발행하면 모든 방문자에게 공개됩니다.'}
              <small>⌘ / Ctrl + S 로 초안 저장</small>
            </p>
            <div className="author-save-actions">
              <button
                className="author-button"
                type="button"
                disabled={Boolean(busy) || conflict}
                onClick={() => void save('draft')}
              >
                {busy === 'draft' ? '저장 중…' : '초안 저장'}
              </button>
              <button
                className="author-button is-primary"
                type="button"
                disabled={Boolean(busy) || conflict}
                onClick={() => void save('publish')}
              >
                {busy === 'publish'
                  ? '발행 중…'
                  : post?.status === 'published'
                    ? '수정 내용 발행'
                    : '발행'}
                <ArrowUpRight size={17} aria-hidden="true" />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function AuthorLibrary({
  revision,
  currentId,
}: {
  revision: number
  currentId: string | undefined
}) {
  const [posts, setPosts] = useState<AuthorPostSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    void getAuthorPosts(controller.signal)
      .then(({ items }) => {
        if (!controller.signal.aborted) setPosts(items)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(authorErrorMessage(cause))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [revision])
  const visiblePosts = posts.filter((post) =>
    `${post.title} ${post.category}`.toLowerCase().includes(filter.toLowerCase()),
  )
  return (
    <details className="author-library">
      <summary>
        <span>
          <FileText size={16} aria-hidden="true" />
          저장한 글 <small>{loading ? '…' : posts.length}</small>
        </span>
        <span>초안과 기존 글 열기</span>
      </summary>
      <div className="author-library-body">
        {error ? (
          <p role="alert">{error}</p>
        ) : loading ? (
          <p aria-busy="true">저장한 글을 불러오는 중…</p>
        ) : posts.length ? (
          <>
            <label className="author-library-filter" htmlFor="author-library-query">
              <span>저장한 글 찾기</span>
              <input
                id="author-library-query"
                value={filter}
                placeholder="제목 또는 분류"
                onChange={(event) => setFilter(event.target.value)}
              />
            </label>
            <ul>
              {visiblePosts.map((item) => (
                <li key={item.id}>
                  {item.contentFormat === 'markdown' ? (
                    <Link
                      to={`/write?id=${encodeURIComponent(item.id)}`}
                      aria-current={item.id === currentId ? 'page' : undefined}
                    >
                      <strong>{item.title}</strong>
                      <span>
                        {item.category} · {statusLabel(item)}
                      </span>
                      <small>{savedTime(item.updatedAt)}</small>
                    </Link>
                  ) : (
                    <div className="author-uneditable">
                      <strong>{item.title}</strong>
                      <span>{item.contentFormat.toUpperCase()} 원문 · Markdown 편집 불가</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {!visiblePosts.length ? <p>검색한 글이 없습니다.</p> : null}
          </>
        ) : (
          <p>아직 저장한 글이 없습니다. 첫 기록을 작성해 보세요.</p>
        )}
      </div>
    </details>
  )
}
