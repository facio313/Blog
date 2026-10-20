import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import type { AuthorPost } from '../src/author-repository.js'
import { createPool, migrateDatabase } from '../src/database.js'
import { seedFromBundle } from '../src/seed.js'
import type { SeedBundle } from '../src/types.js'
import { createRandomTestDatabase, type TestDatabase } from './postgres-test-database.js'

const bundlePath = fileURLToPath(new URL('../../../content/seed/posts.json', import.meta.url))
const identity = {
  'remote-user': 'cks',
  'remote-groups': 'user,admin,chief-admin,portfolio-v2',
  'x-portfolio-edge-secret': 'author-integration-test-secret-with-at-least-32-characters',
}
const fields = {
  title: '새 Markdown 기록',
  description: '작성 기능 검증',
  category: 'Notes',
  tags: ['markdown', 'test'],
  contentRaw: '# 첫 기록\n\n**Markdown** 본문\n\n```js\nconst answer = 42\n```\n',
}

describe.sequential('authoring persistence and publication', () => {
  let database: TestDatabase
  let pool: Pool
  let app: FastifyInstance
  let bundle: SeedBundle
  let mutationHeaders: Record<string, string>
  let created: AuthorPost

  beforeAll(async () => {
    database = await createRandomTestDatabase()
    pool = createPool(database.databaseUrl)
    await migrateDatabase(pool)
    bundle = (await seedFromBundle(pool, bundlePath)).bundle
    app = await buildApp({
      pool,
      author: {
        mode: 'sso',
        owner: 'cks',
        edgeSecret: identity['x-portfolio-edge-secret'],
        publicBaseUrl: 'https://bonifacio.work/blog',
      },
    })
    const session = await app.inject({
      method: 'GET',
      url: '/blog/api/author/session',
      headers: identity,
    })
    expect(session.statusCode).toBe(200)
    mutationHeaders = {
      ...identity,
      origin: 'https://bonifacio.work',
      'x-csrf-token': session.json<{ csrfToken: string }>().csrfToken,
    }
  }, 30_000)

  afterAll(async () => {
    await app?.close()
    await pool?.end()
    await database?.drop()
  }, 30_000)

  it('protects the actual author routes before any draft read or database mutation', async () => {
    const before = await pool.query('SELECT count(*)::int AS count FROM posts')
    const anonymous = await app.inject({ method: 'GET', url: '/blog/api/author/posts' })
    expect(anonymous.statusCode).toBe(401)
    const forged = await app.inject({
      method: 'GET',
      url: '/blog/api/author/posts',
      headers: { 'remote-user': 'cks', 'remote-groups': 'user,admin,chief-admin,portfolio-v2' },
    })
    expect(forged.statusCode).toBe(403)
    for (const headers of [
      { ...mutationHeaders, 'remote-user': 'another-user' },
      { ...mutationHeaders, origin: 'https://another-site.example' },
      { ...mutationHeaders, 'x-csrf-token': 'incorrect' },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/blog/api/author/posts',
        headers,
        payload: { ...fields, action: 'publish' },
      })
      expect(response.statusCode).toBe(403)
    }
    const after = await pool.query('SELECT count(*)::int AS count FROM posts')
    expect(after.rows).toEqual(before.rows)
  })

  it('creates a private draft and exposes neither its body nor title in public queries', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/blog/api/author/posts',
      headers: mutationHeaders,
      payload: { ...fields, action: 'draft' },
    })
    expect(response.statusCode).toBe(201)
    created = response.json<{ post: AuthorPost }>().post
    expect(created).toMatchObject({ ...fields, status: 'draft', hasDraft: true, version: 1 })

    const detail = await app.inject({ method: 'GET', url: `/blog/api/posts/${created.slug}` })
    expect(detail.statusCode).toBe(404)
    const search = await app.inject({
      method: 'GET',
      url: `/blog/api/posts?q=${encodeURIComponent(fields.title)}`,
    })
    expect(search.json()).toMatchObject({ total: 0 })
    const list = await app.inject({
      method: 'GET',
      url: '/blog/api/author/posts',
      headers: identity,
    })
    const item = list
      .json<{ items: Record<string, unknown>[] }>()
      .items.find((p) => p.id === created.id)
    expect(item).toMatchObject({ title: fields.title, hasDraft: true })
    expect(item).not.toHaveProperty('contentRaw')
  })

  it('publishes with the same sanitized output as preview and preserves the article URL', async () => {
    const contentRaw = `${fields.contentRaw}\n<script>alert(1)</script>\n[bad](javascript:alert(1))`
    const preview = await app.inject({
      method: 'POST',
      url: '/blog/api/author/preview',
      headers: mutationHeaders,
      payload: { contentRaw },
    })
    const response = await app.inject({
      method: 'PUT',
      url: `/blog/api/author/posts/${created.id}`,
      headers: mutationHeaders,
      payload: {
        ...fields,
        contentRaw,
        title: '제목을 바꾼 기록',
        action: 'publish',
        version: created.version,
      },
    })
    expect(response.statusCode).toBe(200)
    const previousSlug = created.slug
    created = response.json<{ post: AuthorPost }>().post
    expect(created).toMatchObject({
      status: 'published',
      hasDraft: false,
      version: 2,
      slug: previousSlug,
    })
    expect(created.publishedAt).not.toBeNull()
    const publicPost = await app.inject({ method: 'GET', url: `/blog/api/posts/${created.slug}` })
    const html = publicPost.json<{ post: { contentHtml: string } }>().post.contentHtml
    expect(html).toBe(preview.json<{ contentHtml: string }>().contentHtml)
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('href="javascript:')
  })

  it('keeps a published article unchanged when saving edits as a draft, then publishes explicitly', async () => {
    const publicBefore = await app.inject({ method: 'GET', url: `/blog/api/posts/${created.slug}` })
    const changed = {
      ...fields,
      title: '아직 공개하지 않은 수정',
      contentRaw: '# 수정 초안\n\n별도 보관.',
    }
    const saved = await app.inject({
      method: 'PUT',
      url: `/blog/api/author/posts/${created.id}`,
      headers: mutationHeaders,
      payload: { ...changed, action: 'draft', version: created.version },
    })
    expect(saved.statusCode).toBe(200)
    created = saved.json<{ post: AuthorPost }>().post
    expect(created).toMatchObject({ status: 'published', hasDraft: true, version: 3, ...changed })
    const publicAfter = await app.inject({ method: 'GET', url: `/blog/api/posts/${created.slug}` })
    expect(publicAfter.json()).toEqual(publicBefore.json())
    const reloaded = await app.inject({
      method: 'GET',
      url: `/blog/api/author/posts/by-slug/${created.slug}`,
      headers: identity,
    })
    expect(reloaded.json<{ post: AuthorPost }>().post.contentRaw).toBe(changed.contentRaw)

    const published = await app.inject({
      method: 'PUT',
      url: `/blog/api/author/posts/${created.id}`,
      headers: mutationHeaders,
      payload: { ...changed, action: 'publish', version: created.version },
    })
    expect(published.statusCode).toBe(200)
    const previousDate = created.publishedAt
    created = published.json<{ post: AuthorPost }>().post
    expect(created).toMatchObject({ hasDraft: false, version: 4, publishedAt: previousDate })
    const updatedPublic = await app.inject({
      method: 'GET',
      url: `/blog/api/posts/${created.slug}`,
    })
    expect(updatedPublic.json<{ post: { title: string } }>().post.title).toBe(changed.title)
  })

  it('allows only one concurrent update from the same version and rejects stale publication', async () => {
    const responses = await Promise.all(
      ['탭 A에서 수정', '탭 B에서 수정'].map((title) =>
        app.inject({
          method: 'PUT',
          url: `/blog/api/author/posts/${created.id}`,
          headers: mutationHeaders,
          payload: { ...fields, title, action: 'draft', version: created.version },
        }),
      ),
    )
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409])
    const success = responses.find((response) => response.statusCode === 200)
    expect(success).toBeDefined()
    const stale = await app.inject({
      method: 'PUT',
      url: `/blog/api/author/posts/${created.id}`,
      headers: mutationHeaders,
      payload: { ...fields, action: 'publish', version: created.version },
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toEqual({ error: 'edit_conflict' })
    created = success!.json<{ post: AuthorPost }>().post
  })

  it('preserves author drafts and publications when the original seed is replayed', async () => {
    const source = bundle.posts.find(
      (post) => post.status === 'published' && post.contentFormat === 'markdown',
    )!
    const original = await app.inject({
      method: 'GET',
      url: `/blog/api/author/posts/${source.id}`,
      headers: identity,
    })
    const version = original.json<{ post: AuthorPost }>().post.version
    const saved = await app.inject({
      method: 'PUT',
      url: `/blog/api/author/posts/${source.id}`,
      headers: mutationHeaders,
      payload: { ...fields, title: '기존 글의 보존할 초안', action: 'draft', version },
    })
    expect(saved.statusCode).toBe(200)
    const draft = saved.json<{ post: AuthorPost }>().post
    expect((await seedFromBundle(pool, bundlePath)).changed).toBe(0)
    const readDraft = await app.inject({
      method: 'GET',
      url: `/blog/api/author/posts/${source.id}`,
      headers: identity,
    })
    expect(readDraft.json().post).toEqual(draft)

    const published = await app.inject({
      method: 'PUT',
      url: `/blog/api/author/posts/${source.id}`,
      headers: mutationHeaders,
      payload: {
        ...fields,
        title: '기존 글의 보존할 공개본',
        action: 'publish',
        version: draft.version,
      },
    })
    expect(published.statusCode).toBe(200)
    expect((await seedFromBundle(pool, bundlePath)).changed).toBe(0)
    const publicPost = await app.inject({
      method: 'GET',
      url: `/blog/api/posts/${encodeURIComponent(source.slug)}`,
    })
    expect(publicPost.json().post.title).toBe('기존 글의 보존할 공개본')
    const managed = await pool.query(
      'SELECT editor_managed, editor_user FROM posts WHERE id = $1',
      [source.id],
    )
    expect(managed.rows[0]).toEqual({ editor_managed: true, editor_user: 'cks' })
    const newDraft = await app.inject({
      method: 'GET',
      url: `/blog/api/author/posts/${created.id}`,
      headers: identity,
    })
    expect(newDraft.json().post).toEqual(created)
  })

  it('also rejects an editor snapshot made stale by a seed update before its first save', async () => {
    const source = bundle.posts.find((post) => post.status === 'draft')!
    const before = await app.inject({
      method: 'GET',
      url: `/blog/api/author/posts/${source.id}`,
      headers: identity,
    })
    const directory = await mkdtemp(path.join(tmpdir(), 'blog-author-seed-'))
    try {
      const changedPath = path.join(directory, 'posts.json')
      await writeFile(
        changedPath,
        JSON.stringify({
          ...bundle,
          posts: bundle.posts.map((post) =>
            post.id === source.id ? { ...post, title: '가져오기에서 수정' } : post,
          ),
        }),
      )
      expect((await seedFromBundle(pool, changedPath)).changed).toBe(1)
      const stale = await app.inject({
        method: 'PUT',
        url: `/blog/api/author/posts/${source.id}`,
        headers: mutationHeaders,
        payload: { ...fields, action: 'draft', version: before.json().post.version },
      })
      expect(stale.statusCode).toBe(409)
    } finally {
      await rm(directory, { recursive: true })
    }
  })

  it('imports and exports Markdown without publishing or changing the raw body', async () => {
    const body = '# 한글\n\n```yaml\nvalue: "---"\n```\n'
    const imported = await app.inject({
      method: 'POST',
      url: '/blog/api/author/import',
      headers: mutationHeaders,
      payload: {
        filename: 'sample.MD',
        markdown: `\uFEFF---\r\ntitle: "가져온 제목"\r\ncategories: [Java]\r\ntags: [a, b]\r\npublished: true\r\n---\r\n${body}`,
      },
    })
    expect(imported.statusCode).toBe(200)
    expect(imported.json()).toEqual({
      title: '가져온 제목',
      description: '',
      category: 'Java',
      tags: ['a', 'b'],
      contentRaw: body,
    })
    const exported = await app.inject({
      method: 'POST',
      url: '/blog/api/author/export',
      headers: mutationHeaders,
      payload: imported.json(),
    })
    expect(exported.statusCode).toBe(200)
    expect(exported.json().markdown).toContain('published: false')
    const reimported = await app.inject({
      method: 'POST',
      url: '/blog/api/author/import',
      headers: mutationHeaders,
      payload: exported.json(),
    })
    expect(reimported.json()).toEqual(imported.json())
    const found = await app.inject({
      method: 'GET',
      url: `/blog/api/posts?q=${encodeURIComponent('가져온 제목')}`,
    })
    expect(found.json().total).toBe(0)
  })

  it('rejects invalid files and quarantined or non-Markdown edits without changing stored data', async () => {
    for (const payload of [
      { filename: 'note.html', markdown: '# title' },
      { filename: 'note.md', markdown: '---\ntitle: [\n---\nbody' },
      { filename: 'note.md', markdown: '---\ntags: [42]\n---\nbody' },
      { filename: '../note.md', markdown: '# title' },
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/blog/api/author/import',
        headers: mutationHeaders,
        payload,
      })
      expect(response.statusCode).toBe(400)
    }
    const large = await app.inject({
      method: 'POST',
      url: '/blog/api/author/preview',
      headers: mutationHeaders,
      payload: { contentRaw: '가'.repeat(175_000) },
    })
    expect(large.statusCode).toBe(400)
    for (const source of [
      bundle.posts.find((post) => post.status === 'quarantined')!,
      bundle.posts.find((post) => post.contentFormat === 'html')!,
    ]) {
      const response = await app.inject({
        method: 'PUT',
        url: `/blog/api/author/posts/${source.id}`,
        headers: mutationHeaders,
        payload: { ...fields, action: 'publish', version: 1 },
      })
      expect(response.statusCode).toBe(source.status === 'quarantined' ? 404 : 422)
    }
    const sensitive = await app.inject({
      method: 'POST',
      url: '/blog/api/author/posts',
      headers: mutationHeaders,
      payload: { ...fields, contentRaw: 'api_key=FAKE_TEST_CREDENTIAL_VALUE', action: 'publish' },
    })
    expect(sensitive.statusCode).toBe(422)
    expect(sensitive.json()).toEqual({ error: 'sensitive_content' })
    const invisible = await app.inject({
      method: 'POST',
      url: '/blog/api/author/posts',
      headers: mutationHeaders,
      payload: { ...fields, contentRaw: '[reference]: https://example.com', action: 'publish' },
    })
    expect(invisible.statusCode).toBe(422)
    expect(invisible.json()).toEqual({ error: 'publication_requires_content' })
  })
})
