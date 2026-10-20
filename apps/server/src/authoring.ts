import type { FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { authorSession, createAuthorGuard, type AuthorAuthOptions } from './author-auth.js'
import { AuthorPostError, AuthorRepository } from './author-repository.js'
import {
  authorFieldsSchema,
  exportMarkdown,
  importMarkdown,
  MarkdownFileError,
  markdownBodySchema,
} from './content/markdown-file.js'
import { redactSensitiveContent } from './content/redaction.js'
import { renderContent } from './content/render.js'

const saveSchema = authorFieldsSchema.extend({ action: z.enum(['draft', 'publish']) })
const updateSchema = saveSchema.extend({ version: z.number().int().positive() })
const idSchema = z.object({ id: z.string().min(1).max(200) })
const slugSchema = z.object({ slug: z.string().min(1).max(200) })
const importSchema = z.object({
  filename: z.string().min(1).max(255),
  markdown: markdownBodySchema,
})
const previewSchema = z.object({ contentRaw: markdownBodySchema })

export async function registerAuthoring(
  app: FastifyInstance,
  pool: Pool,
  options?: AuthorAuthOptions,
): Promise<void> {
  const repository = new AuthorRepository(pool)
  await app.register(
    async (author) => {
      author.addHook('onRequest', createAuthorGuard(options))
      author.setErrorHandler(async (error, request, reply) => {
        if (error instanceof AuthorPostError) {
          return reply.status(error.statusCode).send({ error: error.code })
        }
        if (error instanceof MarkdownFileError) {
          return reply.status(400).send({ error: error.message })
        }
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: 'invalid_author_input' })
        }
        if (error instanceof Error && 'statusCode' in error) {
          if (error.statusCode === 413) return reply.status(413).send({ error: 'file_too_large' })
          if (error.statusCode === 400 || error.statusCode === 415) {
            return reply.status(error.statusCode).send({ error: 'invalid_author_input' })
          }
        }
        // Driver/parser exceptions may contain private content. Log only the failure category.
        request.log.error({ category: 'author_request_failed' }, 'author request failed')
        return reply.status(500).send({ error: 'internal_error' })
      })

      author.get('/session', async () => authorSession(options))
      author.get('/posts', async () => ({ items: await repository.list() }))
      author.get('/posts/by-slug/:slug', async (request) => {
        const { slug } = slugSchema.parse(request.params)
        return { post: await repository.find(slug, true) }
      })
      author.get('/posts/:id', async (request) => {
        const { id } = idSchema.parse(request.params)
        return { post: await repository.find(id) }
      })
      author.post('/preview', { bodyLimit: 1024 * 1024 }, async (request) => {
        const { contentRaw } = previewSchema.parse(request.body)
        return { contentHtml: renderContent(contentRaw, 'markdown') }
      })
      author.post('/import', { bodyLimit: 1024 * 1024 }, async (request) => {
        const { filename, markdown } = importSchema.parse(request.body)
        return importMarkdown(filename, markdown)
      })
      author.post('/export', { bodyLimit: 1024 * 1024 }, async (request) => {
        return exportMarkdown(authorFieldsSchema.parse(request.body))
      })
      author.post('/posts', { bodyLimit: 1024 * 1024 }, async (request, reply) => {
        const data = saveSchema.parse(request.body)
        const failure = publicationError(data)
        if (failure) return reply.status(422).send({ error: failure })
        const post = await repository.save(data, data.action, authorSession(options).user)
        return reply.status(201).send({ post })
      })
      author.put('/posts/:id', { bodyLimit: 1024 * 1024 }, async (request, reply) => {
        const { id } = idSchema.parse(request.params)
        const data = updateSchema.parse(request.body)
        const failure = publicationError(data)
        if (failure) return reply.status(422).send({ error: failure })
        const post = await repository.save(data, data.action, authorSession(options).user, {
          id,
          version: data.version,
        })
        return { post }
      })
    },
    { prefix: '/blog/api/author' },
  )
}

function publicationError(data: z.infer<typeof saveSchema>): string | null {
  if (data.action !== 'publish') return null
  if (
    !data.title.trim() ||
    !data.contentRaw.trim() ||
    !renderContent(data.contentRaw, 'markdown').trim()
  ) {
    return 'publication_requires_content'
  }
  const sensitive = redactSensitiveContent(
    [data.title, data.description, data.category, ...data.tags, data.contentRaw].join('\n'),
  )
  return sensitive.reasons.length > 0 ? 'sensitive_content' : null
}
