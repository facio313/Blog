import type { Pool } from 'pg'
import type { ContentFormat, PostDetail, PostSummary } from './types.js'

interface PostRow {
  slug: string
  title: string
  description: string
  excerpt: string
  category: string
  tags: string[]
  reading_minutes: number
  published_at: Date | null
  content_html?: string
  content_format?: ContentFormat
  source_path?: string
}

export interface ListPostFilters {
  query?: string
  category?: string
  page: number
  limit: number
}

function summaryFromRow(row: PostRow): PostSummary {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    excerpt: row.excerpt,
    category: row.category,
    tags: row.tags,
    readingMinutes: row.reading_minutes,
    publishedAt: row.published_at?.toISOString() ?? null,
  }
}

export class PostRepository {
  constructor(private readonly pool: Pool) {}

  async list(filters: ListPostFilters): Promise<{ items: PostSummary[]; total: number }> {
    const conditions = ["status = 'published'"]
    const values: unknown[] = []

    if (filters.category) {
      values.push(filters.category)
      conditions.push(`category = $${values.length}`)
    }

    if (filters.query) {
      values.push(`%${filters.query}%`)
      const position = values.length
      conditions.push(`(
        title ILIKE $${position}
        OR description ILIKE $${position}
        OR excerpt ILIKE $${position}
        OR category ILIKE $${position}
        OR array_to_string(tags, ' ') ILIKE $${position}
        OR content_raw ILIKE $${position}
      )`)
    }

    const where = conditions.join(' AND ')
    const count = await this.pool.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM posts WHERE ${where}`,
      values,
    )

    values.push(filters.limit, (filters.page - 1) * filters.limit)
    const result = await this.pool.query<PostRow>(
      `
        SELECT slug, title, description, excerpt, category, tags, reading_minutes, published_at
        FROM posts
        WHERE ${where}
        ORDER BY published_at DESC NULLS LAST, title ASC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values,
    )

    return {
      items: result.rows.map(summaryFromRow),
      total: Number(count.rows[0]?.total ?? 0),
    }
  }

  async findBySlug(slug: string): Promise<PostDetail | null> {
    const result = await this.pool.query<PostRow>(
      `
        SELECT slug, title, description, excerpt, category, tags, reading_minutes,
               published_at, content_html, content_format, source_path_nfc AS source_path
        FROM posts
        WHERE slug = $1 AND status = 'published'
        LIMIT 1
      `,
      [slug],
    )
    const row = result.rows[0]
    if (!row || !row.content_html || !row.content_format || !row.source_path) return null

    return {
      ...summaryFromRow(row),
      contentHtml: row.content_html,
      contentFormat: row.content_format,
      sourcePath: row.source_path,
    }
  }

  async categories(): Promise<Array<{ name: string; count: number }>> {
    const result = await this.pool.query<{ name: string; count: string }>(`
      SELECT category AS name, count(*)::text AS count
      FROM posts
      WHERE status = 'published'
      GROUP BY category
      ORDER BY count(*) DESC, category ASC
    `)
    return result.rows.map((row) => ({ name: row.name, count: Number(row.count) }))
  }

  async stats(): Promise<{ posts: number; categories: number; latestPublishedAt: string | null }> {
    const result = await this.pool.query<{
      posts: string
      categories: string
      latest_published_at: Date | null
    }>(`
      SELECT
        count(*)::text AS posts,
        count(DISTINCT category)::text AS categories,
        max(published_at) AS latest_published_at
      FROM posts
      WHERE status = 'published'
    `)
    const row = result.rows[0]
    return {
      posts: Number(row?.posts ?? 0),
      categories: Number(row?.categories ?? 0),
      latestPublishedAt: row?.latest_published_at?.toISOString() ?? null,
    }
  }

  async related(category: string, currentSlug: string, limit = 3): Promise<PostSummary[]> {
    const result = await this.pool.query<PostRow>(
      `
        SELECT slug, title, description, excerpt, category, tags, reading_minutes, published_at
        FROM posts
        WHERE status = 'published' AND category = $1 AND slug <> $2
        ORDER BY published_at DESC NULLS LAST
        LIMIT $3
      `,
      [category, currentSlug, limit],
    )
    return result.rows.map(summaryFromRow)
  }
}
