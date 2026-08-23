export type ContentFormat = 'markdown' | 'html' | 'text'
export type PostStatus = 'draft' | 'review' | 'published' | 'quarantined'

export interface SeedPost {
  id: string
  slug: string
  sourcePath: string
  sourcePathNfc: string
  sourceHash: string
  title: string
  description: string
  excerpt: string
  category: string
  tags: string[]
  contentFormat: ContentFormat
  contentRaw: string
  contentHtml: string
  readingMinutes: number
  status: PostStatus
  reviewReasons: string[]
  publishedAt: string | null
  sourceUpdatedAt: string | null
}

export interface SeedBundle {
  schemaVersion: 1
  generatedAt: string
  sourceRoot: string
  counts: {
    discovered: number
    imported: number
    published: number
    review: number
    skipped: number
  }
  posts: SeedPost[]
  skipped: Array<{ sourcePath: string; reason: string }>
}

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
  contentFormat: ContentFormat
  sourcePath: string
}
