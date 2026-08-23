import helmet from '@fastify/helmet'
import Fastify, { type FastifyInstance } from 'fastify'
import type { Pool } from 'pg'
import { z } from 'zod'
import { PostRepository } from './repository.js'

const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
})

const slugParamsSchema = z.object({
  slug: z.string().trim().min(1).max(200),
})

export interface BuildAppOptions {
  pool: Pool
  logger?: boolean | { level: string }
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: '127.0.0.1',
    bodyLimit: 64 * 1024,
  })
  const repository = new PostRepository(options.pool)

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })

  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('Cache-Control', 'no-store')
    return payload
  })

  app.get('/blog/api/health', async (_request, reply) => {
    try {
      await options.pool.query('SELECT 1')
      return { ok: true }
    } catch {
      return reply.status(503).send({ ok: false })
    }
  })

  app.get('/blog/api/posts', async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'invalid_query' })
    }
    const result = await repository.list({
      page: parsed.data.page,
      limit: parsed.data.limit,
      ...(parsed.data.q ? { query: parsed.data.q } : {}),
      ...(parsed.data.category ? { category: parsed.data.category } : {}),
    })
    return {
      ...result,
      page: parsed.data.page,
      limit: parsed.data.limit,
      pages: Math.max(1, Math.ceil(result.total / parsed.data.limit)),
    }
  })

  app.get('/blog/api/posts/:slug', async (request, reply) => {
    const parsed = slugParamsSchema.safeParse(request.params)
    if (!parsed.success) return reply.status(400).send({ error: 'invalid_slug' })

    const post = await repository.findBySlug(parsed.data.slug)
    if (!post) return reply.status(404).send({ error: 'post_not_found' })
    const related = await repository.related(post.category, post.slug)
    return { post, related }
  })

  app.get('/blog/api/meta', async () => {
    const [categories, stats] = await Promise.all([repository.categories(), repository.stats()])
    return { categories, stats }
  })

  app.setNotFoundHandler(async (_request, reply) => {
    return reply.status(404).send({ error: 'not_found' })
  })

  app.setErrorHandler(async (error, request, reply) => {
    request.log.error({ error }, 'request failed')
    return reply.status(500).send({ error: 'internal_error' })
  })

  return app
}
