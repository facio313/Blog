import { readFile } from 'node:fs/promises'
import type { Pool, PoolClient } from 'pg'
import { z } from 'zod'
import type { SeedBundle, SeedPost } from './types.js'

const seedPostSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  sourcePath: z.string().min(1),
  sourcePathNfc: z.string().min(1),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  title: z.string().min(1),
  description: z.string(),
  excerpt: z.string(),
  category: z.string().min(1),
  tags: z.array(z.string()),
  contentFormat: z.enum(['markdown', 'html', 'text']),
  contentRaw: z.string(),
  contentHtml: z.string(),
  readingMinutes: z.number().int().positive(),
  status: z.enum(['draft', 'review', 'published', 'quarantined']),
  reviewReasons: z.array(z.string()),
  publishedAt: z.string().datetime().nullable(),
  sourceUpdatedAt: z.string().datetime().nullable(),
})

const bundleSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  sourceRoot: z.string(),
  counts: z.object({
    discovered: z.number().int().nonnegative(),
    imported: z.number().int().nonnegative(),
    published: z.number().int().nonnegative(),
    review: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
  posts: z.array(seedPostSchema),
  skipped: z.array(z.object({ sourcePath: z.string(), reason: z.string() })),
})

async function upsertPost(client: PoolClient, post: SeedPost): Promise<boolean> {
  const result = await client.query(
    `
      INSERT INTO posts (
        id, slug, source_path, source_path_nfc, source_hash, title, description, excerpt, category,
        tags, content_format, content_raw, content_html, reading_minutes, status,
        review_reasons, published_at, source_updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16, $17, $18
      )
      ON CONFLICT (source_path) DO UPDATE SET
        slug = EXCLUDED.slug,
        source_path_nfc = EXCLUDED.source_path_nfc,
        source_hash = EXCLUDED.source_hash,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        excerpt = EXCLUDED.excerpt,
        category = EXCLUDED.category,
        tags = EXCLUDED.tags,
        content_format = EXCLUDED.content_format,
        content_raw = EXCLUDED.content_raw,
        content_html = EXCLUDED.content_html,
        reading_minutes = EXCLUDED.reading_minutes,
        status = EXCLUDED.status,
        review_reasons = EXCLUDED.review_reasons,
        published_at = EXCLUDED.published_at,
        source_updated_at = EXCLUDED.source_updated_at,
        updated_at = now()
      WHERE ROW(
        posts.slug, posts.source_path_nfc, posts.source_hash, posts.title, posts.description,
        posts.excerpt, posts.category, posts.tags, posts.content_format, posts.content_raw,
        posts.content_html, posts.reading_minutes, posts.status, posts.review_reasons,
        posts.published_at, posts.source_updated_at
      ) IS DISTINCT FROM ROW(
        EXCLUDED.slug, EXCLUDED.source_path_nfc, EXCLUDED.source_hash, EXCLUDED.title,
        EXCLUDED.description, EXCLUDED.excerpt, EXCLUDED.category, EXCLUDED.tags,
        EXCLUDED.content_format, EXCLUDED.content_raw, EXCLUDED.content_html,
        EXCLUDED.reading_minutes, EXCLUDED.status, EXCLUDED.review_reasons,
        EXCLUDED.published_at, EXCLUDED.source_updated_at
      )
      RETURNING id
    `,
    [
      post.id,
      post.slug,
      post.sourcePath,
      post.sourcePathNfc,
      post.sourceHash,
      post.title,
      post.description,
      post.excerpt,
      post.category,
      post.tags,
      post.contentFormat,
      post.contentRaw,
      post.contentHtml,
      post.readingMinutes,
      post.status,
      post.reviewReasons,
      post.publishedAt,
      post.sourceUpdatedAt,
    ],
  )
  return result.rowCount === 1
}

export async function seedFromBundle(
  pool: Pool,
  bundlePath: string,
): Promise<{ bundle: SeedBundle; changed: number }> {
  const payload = await readFile(bundlePath, 'utf8')
  const bundle = bundleSchema.parse(JSON.parse(payload)) as SeedBundle
  let changed = 0

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const post of bundle.posts) {
      if (await upsertPost(client, post)) changed += 1
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  return { bundle, changed }
}
