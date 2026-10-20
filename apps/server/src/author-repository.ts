import { createHash, randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import type { AuthorFields } from './content/markdown-file.js'
import { renderContent, stripMarkup } from './content/render.js'
import type { ContentFormat, PostStatus } from './types.js'

interface AuthorRow {
  id: string
  slug: string
  title: string
  description: string
  category: string
  tags: string[]
  content_raw: string
  content_format: ContentFormat
  status: PostStatus
  has_draft: boolean
  edit_version: number
  updated_at: Date
  published_at: Date | null
}

export interface AuthorPost extends AuthorFields {
  id: string
  slug: string
  status: PostStatus
  hasDraft: boolean
  version: number
  updatedAt: string
  publishedAt: string | null
}

export class AuthorPostError extends Error {
  constructor(
    readonly code: 'post_not_found' | 'unsupported_format' | 'edit_conflict',
    readonly statusCode: number,
  ) {
    super(code)
  }
}

const editableSelect = `
  SELECT p.id, p.slug, COALESCE(d.title, p.title) AS title,
         COALESCE(d.description, p.description) AS description,
         COALESCE(d.category, p.category) AS category,
         COALESCE(d.tags, p.tags) AS tags,
         COALESCE(d.content_raw, p.content_raw) AS content_raw,
         p.content_format, p.status, d.post_id IS NOT NULL AS has_draft,
         p.edit_version, p.updated_at, p.published_at
  FROM posts p LEFT JOIN post_drafts d ON d.post_id = p.id
`

function authorPost(row: AuthorRow): AuthorPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    category: row.category,
    tags: row.tags,
    contentRaw: row.content_raw,
    status: row.status,
    hasDraft: row.has_draft,
    version: row.edit_version,
    updatedAt: row.updated_at.toISOString(),
    publishedAt: row.published_at?.toISOString() ?? null,
  }
}

function normalizeFields(fields: AuthorFields): AuthorFields {
  return {
    ...fields,
    title: fields.title || '제목 없는 글',
    category: fields.category || 'Notes',
    tags: [...new Set(fields.tags)],
  }
}

function slugForTitle(title: string, id: string): string {
  const base = title
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140)
  return `${base || 'note'}--${id.slice(0, 8)}`
}

async function findEditable(
  client: Pool | PoolClient,
  value: string,
  bySlug = false,
): Promise<AuthorPost> {
  const result = await client.query<AuthorRow>(
    `${editableSelect} WHERE p.${bySlug ? 'slug' : 'id'} = $1 AND p.status <> 'quarantined'`,
    [value],
  )
  const row = result.rows[0]
  if (!row) throw new AuthorPostError('post_not_found', 404)
  if (row.content_format !== 'markdown') throw new AuthorPostError('unsupported_format', 422)
  return authorPost(row)
}

export class AuthorRepository {
  constructor(private readonly pool: Pool) {}

  async list() {
    const result = await this.pool.query<
      Omit<AuthorRow, 'description' | 'tags' | 'content_raw' | 'published_at'>
    >(`
      SELECT p.id, p.slug, COALESCE(d.title, p.title) AS title,
             COALESCE(d.category, p.category) AS category, p.status, p.content_format,
             d.post_id IS NOT NULL AS has_draft, p.edit_version, p.updated_at
      FROM posts p LEFT JOIN post_drafts d ON d.post_id = p.id
      WHERE p.status <> 'quarantined'
      ORDER BY p.updated_at DESC, p.id
    `)
    return result.rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      category: row.category,
      status: row.status,
      contentFormat: row.content_format,
      hasDraft: row.has_draft,
      version: row.edit_version,
      updatedAt: row.updated_at.toISOString(),
    }))
  }

  find(value: string, bySlug = false): Promise<AuthorPost> {
    return findEditable(this.pool, value, bySlug)
  }

  async save(
    input: AuthorFields,
    action: 'draft' | 'publish',
    user: string,
    existing?: { id: string; version: number },
  ): Promise<AuthorPost> {
    const fields = normalizeFields(input)
    const client = await this.pool.connect()
    const id = existing?.id ?? randomUUID()

    try {
      await client.query('BEGIN')
      if (existing) {
        const locked = await client.query<{
          status: PostStatus
          content_format: ContentFormat
          edit_version: number
        }>('SELECT status, content_format, edit_version FROM posts WHERE id = $1 FOR UPDATE', [id])
        const row = locked.rows[0]
        if (!row || row.status === 'quarantined') throw new AuthorPostError('post_not_found', 404)
        if (row.content_format !== 'markdown') throw new AuthorPostError('unsupported_format', 422)
        if (row.edit_version !== existing.version) throw new AuthorPostError('edit_conflict', 409)
        await client.query(
          `UPDATE posts SET editor_managed = true, editor_user = $2,
           edit_version = edit_version + 1, updated_at = clock_timestamp() WHERE id = $1`,
          [id, user],
        )
      } else {
        const sourcePath = `_editor/${id}.md`
        await client.query(
          `INSERT INTO posts (
            id, slug, source_path, source_path_nfc, source_hash, title, description, category,
            content_format, content_raw, content_html, reading_minutes, status,
            editor_managed, editor_user
          ) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, 'markdown', '', '', 1, 'draft', true, $8)`,
          [
            id,
            slugForTitle(fields.title, id),
            sourcePath,
            createHash('sha256').update('').digest('hex'),
            fields.title,
            fields.description,
            fields.category,
            user,
          ],
        )
      }

      if (action === 'draft') {
        await client.query(
          `INSERT INTO post_drafts (post_id, title, description, category, tags, content_raw)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (post_id) DO UPDATE SET
             title = EXCLUDED.title, description = EXCLUDED.description,
             category = EXCLUDED.category, tags = EXCLUDED.tags,
             content_raw = EXCLUDED.content_raw, updated_at = clock_timestamp()`,
          [id, fields.title, fields.description, fields.category, fields.tags, fields.contentRaw],
        )
      } else {
        const html = renderContent(fields.contentRaw, 'markdown')
        const plain = stripMarkup(html)
        await client.query(
          `UPDATE posts SET title = $2, description = $3, category = $4, tags = $5,
             content_raw = $6, content_html = $7, excerpt = $8, reading_minutes = $9,
             status = 'published', published_at = COALESCE(published_at, now()),
             review_reasons = ARRAY[]::text[]
           WHERE id = $1`,
          [
            id,
            fields.title,
            fields.description,
            fields.category,
            fields.tags,
            fields.contentRaw,
            html,
            plain.slice(0, 220),
            Math.max(1, Math.ceil(plain.length / 500)),
          ],
        )
        await client.query('DELETE FROM post_drafts WHERE post_id = $1', [id])
      }
      const saved = await findEditable(client, id)
      await client.query('COMMIT')
      return saved
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}
