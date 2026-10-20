export interface AuthorSession {
  user: string
  csrfToken: string
}

export interface AuthorFields {
  title: string
  description: string
  category: string
  tags: string[]
  contentRaw: string
}

export interface AuthorPost extends AuthorFields {
  id: string
  slug: string
  status: 'draft' | 'review' | 'published'
  hasDraft: boolean
  version: number
  updatedAt: string
  publishedAt: string | null
}

export interface AuthorPostSummary {
  id: string
  slug: string
  title: string
  category: string
  status: AuthorPost['status']
  hasDraft: boolean
  version: number
  updatedAt: string
  contentFormat: 'markdown' | 'html' | 'text'
}

export const markdownByteLimit = 512 * 1024

export class AuthorApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code)
  }
}

async function request<T>(
  path: string,
  options: { signal?: AbortSignal; csrfToken?: string; body?: unknown; method?: string } = {},
): Promise<T> {
  const response = await fetch(`/blog/api/author${path}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.csrfToken ? { 'X-CSRF-Token': options.csrfToken } : {}),
    },
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  })
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null)
    const code =
      payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : 'request_failed'
    throw new AuthorApiError(code, response.status)
  }
  return (await response.json()) as T
}

export function getAuthorSession(signal: AbortSignal): Promise<AuthorSession> {
  return request('/session', { signal })
}

export function getAuthorPosts(signal: AbortSignal): Promise<{ items: AuthorPostSummary[] }> {
  return request('/posts', { signal })
}

export function getAuthorPost(
  selection: { id: string } | { slug: string },
  signal?: AbortSignal,
): Promise<{ post: AuthorPost }> {
  const path =
    'id' in selection
      ? `/posts/${encodeURIComponent(selection.id)}`
      : `/posts/by-slug/${encodeURIComponent(selection.slug)}`
  return request(path, signal ? { signal } : {})
}

export function saveAuthorPost(
  fields: AuthorFields,
  action: 'draft' | 'publish',
  session: AuthorSession,
  current: AuthorPost | null,
): Promise<{ post: AuthorPost }> {
  return request(current ? `/posts/${encodeURIComponent(current.id)}` : '/posts', {
    csrfToken: session.csrfToken,
    method: current ? 'PUT' : 'POST',
    body: { ...fields, action, ...(current ? { version: current.version } : {}) },
  })
}

export function previewMarkdown(
  contentRaw: string,
  csrfToken: string,
  signal: AbortSignal,
): Promise<{ contentHtml: string }> {
  return request('/preview', { csrfToken, body: { contentRaw }, signal })
}

export function importMarkdown(
  filename: string,
  markdown: string,
  csrfToken: string,
): Promise<AuthorFields> {
  return request('/import', { csrfToken, body: { filename, markdown } })
}

export function exportMarkdown(
  fields: AuthorFields,
  csrfToken: string,
): Promise<{ filename: string; markdown: string }> {
  return request('/export', { csrfToken, body: fields })
}

export function authorErrorMessage(error: unknown): string {
  if (!(error instanceof AuthorApiError)) {
    return '서버에 연결하지 못했습니다. 작성한 내용은 유지됩니다. 연결을 확인하고 다시 시도해 주세요.'
  }
  if (error.status === 401) {
    return '로그인이 만료되었습니다. 작성한 내용을 .md로 보관하거나 다른 탭에서 다시 로그인해 주세요.'
  }
  if (error.code === 'edit_conflict') {
    return '다른 창에서 이 글을 변경했습니다. 현재 입력은 그대로 두었습니다. .md로 보관한 뒤 최신 버전을 불러와 주세요.'
  }
  if (error.code === 'invalid_csrf_token') {
    return '로그인 상태가 변경되었습니다. 로그인 상태를 갱신한 뒤 다시 저장해 주세요.'
  }
  if (error.code === 'sensitive_content') {
    return '비밀키나 인증정보로 보이는 내용이 있어 발행하지 않았습니다. 본문을 확인해 주세요. 초안으로는 보관할 수 있습니다.'
  }
  if (error.code === 'publication_requires_content')
    return '발행하려면 제목과 본문을 작성해 주세요.'
  if (error.code === 'invalid_frontmatter' || error.code === 'invalid_markdown_metadata') {
    return 'Markdown 파일 앞부분의 글 정보 형식을 읽지 못했습니다. 제목·분류·태그 형식을 확인해 주세요.'
  }
  if (error.status === 403) return '이 계정에는 글을 작성할 권한이 없습니다.'
  if (error.status === 404) return '편집할 글을 찾을 수 없습니다.'
  if (error.status === 413) return 'Markdown 파일과 본문은 512KB 이하로 작성해 주세요.'
  if (error.status === 503)
    return '지금은 글 작성 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.'
  if (error.status === 422 || error.status === 400) {
    return '입력 내용을 확인해 주세요. 제목·본문과 각 입력란의 길이 제한을 확인한 뒤 다시 시도해 주세요.'
  }
  return '요청을 완료하지 못했습니다. 작성한 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.'
}

export function authorLoginUrl(): string {
  return `/sso/?rd=${encodeURIComponent(`${window.location.origin}/blog/write`)}`
}
