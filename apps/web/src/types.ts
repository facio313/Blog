export interface PostSummary {
  slug: string
  title: string
  description: string
  excerpt: string
  category: string
  tags: string[]
  readingMinutes: number
  publishedAt: string | null
}

export interface PostDetail extends PostSummary {
  contentHtml: string
  contentFormat: 'markdown' | 'html' | 'text'
  sourcePath: string
}

export interface PostsResponse {
  items: PostSummary[]
  total: number
  page: number
  limit: number
  pages: number
}

export interface MetaResponse {
  categories: Array<{ name: string; count: number }>
  stats: {
    posts: number
    categories: number
    latestPublishedAt: string | null
  }
}

export interface PostResponse {
  post: PostDetail
  related: PostSummary[]
}
