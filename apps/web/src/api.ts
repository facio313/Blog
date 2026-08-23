import type { MetaResponse, PostResponse, PostsResponse } from './types'

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/blog/api${path}`, {
    headers: { Accept: 'application/json' },
    ...(signal ? { signal } : {}),
  })

  if (!response.ok) {
    throw new ApiError(response.status === 404 ? 'not_found' : 'request_failed', response.status)
  }
  return (await response.json()) as T
}

export function getPosts(
  filters: {
    query?: string | undefined
    category?: string | undefined
    limit?: number | undefined
  } = {},
  signal?: AbortSignal,
): Promise<PostsResponse> {
  const search = new URLSearchParams({ limit: String(filters.limit ?? 50) })
  if (filters.query) search.set('q', filters.query)
  if (filters.category) search.set('category', filters.category)
  return request<PostsResponse>(`/posts?${search}`, signal)
}

export function getMeta(signal?: AbortSignal): Promise<MetaResponse> {
  return request<MetaResponse>('/meta', signal)
}

export function getPost(slug: string, signal?: AbortSignal): Promise<PostResponse> {
  return request<PostResponse>(`/posts/${encodeURIComponent(slug)}`, signal)
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}
