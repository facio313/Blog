import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { createPool, migrateDatabase } from '../src/database.js'
import { seedFromBundle } from '../src/seed.js'
import type { SeedBundle } from '../src/types.js'
import { createRandomTestDatabase, type TestDatabase } from './postgres-test-database.js'

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url))
const bundlePath = path.join(workspaceRoot, 'content/seed/posts.json')

describe.sequential('PostgreSQL migration, seed, and public API', () => {
  let database: TestDatabase
  let pool: Pool
  let app: FastifyInstance
  let bundle: SeedBundle
  let firstMigrations: string[]
  let secondMigrations: string[]
  let firstSeedChanged = -1
  let secondSeedChanged = -1

  beforeAll(async () => {
    database = await createRandomTestDatabase()
    pool = createPool(database.databaseUrl)
    firstMigrations = await migrateDatabase(pool)
    secondMigrations = await migrateDatabase(pool)
    const firstSeed = await seedFromBundle(pool, bundlePath)
    const secondSeed = await seedFromBundle(pool, bundlePath)
    bundle = firstSeed.bundle
    firstSeedChanged = firstSeed.changed
    secondSeedChanged = secondSeed.changed
    app = await buildApp({ pool, logger: false })
    await app.ready()
  }, 30_000)

  afterAll(async () => {
    await app?.close()
    await pool?.end()
    await database?.drop()
  }, 30_000)

  it('uses a collision-resistant isolated database and idempotent migration/seed flow', async () => {
    expect(database.databaseName).toMatch(/^bonifacio_test_\d+_[a-f0-9]{12}$/)
    expect(firstMigrations).toEqual(['001_initial.sql'])
    expect(secondMigrations).toEqual([])
    expect(firstSeedChanged).toBe(121)
    expect(secondSeedChanged).toBe(0)

    const counts = await pool.query<{ total: string; published: string; quarantined: string }>(`
      SELECT
        count(*)::text AS total,
        count(*) FILTER (WHERE status = 'published')::text AS published,
        count(*) FILTER (WHERE status = 'quarantined')::text AS quarantined
      FROM posts
    `)
    expect(counts.rows[0]).toEqual({ total: '121', published: '32', quarantined: '1' })
  })

  it('serves health, metadata, and only published rows through the API', async () => {
    const health = await app.inject({ method: 'GET', url: '/blog/api/health' })
    expect(health.statusCode).toBe(200)
    expect(health.json()).toEqual({ ok: true })

    const list = await app.inject({ method: 'GET', url: '/blog/api/posts?limit=50' })
    expect(list.statusCode).toBe(200)
    expect(list.headers['cache-control']).toBe('no-store')
    const listPayload = list.json<{
      items: Array<{ slug: string; category: string }>
      total: number
      pages: number
    }>()
    expect(listPayload.total).toBe(32)
    expect(listPayload.items).toHaveLength(32)
    expect(listPayload.pages).toBe(1)

    const publicSlugs = new Set(
      bundle.posts.filter((post) => post.status === 'published').map((post) => post.slug),
    )
    expect(listPayload.items.every((post) => publicSlugs.has(post.slug))).toBe(true)

    const meta = await app.inject({ method: 'GET', url: '/blog/api/meta' })
    expect(meta.statusCode).toBe(200)
    const metaPayload = meta.json<{ stats: { posts: number; categories: number } }>()
    expect(metaPayload.stats.posts).toBe(32)
    expect(metaPayload.stats.categories).toBeGreaterThan(0)
  })

  it('supports public detail/search/category queries while hiding review and quarantined rows', async () => {
    const published = bundle.posts.find((post) => post.status === 'published')
    const review = bundle.posts.find((post) => post.status === 'review')
    const quarantined = bundle.posts.find((post) => post.status === 'quarantined')
    expect(published).toBeDefined()
    expect(review).toBeDefined()
    expect(quarantined).toBeDefined()

    const detail = await app.inject({
      method: 'GET',
      url: `/blog/api/posts/${encodeURIComponent(published?.slug ?? '')}`,
    })
    expect(detail.statusCode).toBe(200)
    expect(detail.json<{ post: { slug: string } }>().post.slug).toBe(published?.slug)

    for (const hidden of [review, quarantined]) {
      const response = await app.inject({
        method: 'GET',
        url: `/blog/api/posts/${encodeURIComponent(hidden?.slug ?? '')}`,
      })
      expect(response.statusCode).toBe(404)
      expect(response.json()).toEqual({ error: 'post_not_found' })
    }

    const search = await app.inject({
      method: 'GET',
      url: `/blog/api/posts?q=${encodeURIComponent(published?.title ?? '')}`,
    })
    expect(search.statusCode).toBe(200)
    expect(search.json<{ total: number }>().total).toBeGreaterThan(0)

    const category = await app.inject({
      method: 'GET',
      url: `/blog/api/posts?category=${encodeURIComponent(published?.category ?? '')}&limit=50`,
    })
    const categoryPayload = category.json<{ items: Array<{ category: string }> }>()
    expect(categoryPayload.items.length).toBeGreaterThan(0)
    expect(categoryPayload.items.every((item) => item.category === published?.category)).toBe(true)

    const invalid = await app.inject({ method: 'GET', url: '/blog/api/posts?limit=51' })
    expect(invalid.statusCode).toBe(400)
    expect(invalid.json()).toEqual({ error: 'invalid_query' })
  })

  it('applies importer metadata changes even when source bytes are unchanged, then restores cleanly', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'bonifacio-seed-policy-'))
    const changedBundlePath = path.join(directory, 'posts.json')
    const target = bundle.posts.find((post) => post.status === 'review')
    if (!target) throw new Error('Expected at least one review post in the audited bundle')

    const changedBundle: SeedBundle = {
      ...bundle,
      posts: bundle.posts.map((post) =>
        post.sourcePath === target.sourcePath
          ? { ...post, title: `${post.title} [reviewed]` }
          : post,
      ),
    }

    try {
      await writeFile(changedBundlePath, `${JSON.stringify(changedBundle)}\n`, 'utf8')
      const changed = await seedFromBundle(pool, changedBundlePath)
      expect(changed.changed).toBe(1)

      const stored = await pool.query<{ title: string }>(
        'SELECT title FROM posts WHERE source_path = $1',
        [target.sourcePath],
      )
      expect(stored.rows[0]?.title).toBe(`${target.title} [reviewed]`)

      const restored = await seedFromBundle(pool, bundlePath)
      expect(restored.changed).toBe(1)
      const unchanged = await seedFromBundle(pool, bundlePath)
      expect(unchanged.changed).toBe(0)
    } finally {
      await rm(directory, { recursive: true })
    }
  })

  it('keeps the quarantined source redacted in PostgreSQL without exposing the source value', async () => {
    const result = await pool.query<{
      status: string
      content_raw: string
      content_html: string
      review_reasons: string[]
    }>(
      `
        SELECT status, content_raw, content_html, review_reasons
        FROM posts
        WHERE source_path_nfc = $1
      `,
      ['Web/ㅁ http vs https.md'],
    )
    const row = result.rows[0]
    expect(row?.status).toBe('quarantined')
    expect(row?.content_raw.includes('[REDACTED BY IMPORTER]')).toBe(true)
    expect(row?.content_html.includes('[REDACTED BY IMPORTER]')).toBe(true)
    expect(row?.review_reasons).toContain('quarantined credential finding')
    const containsCredentialLikeNgrokCommand = /add-authtoken\s+[A-Za-z0-9_-]{20,}/i.test(
      row?.content_raw ?? '',
    )
    expect(containsCredentialLikeNgrokCommand).toBe(false)
  })
})
