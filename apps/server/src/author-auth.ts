import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { onRequestAsyncHookHandler } from 'fastify'

export interface AuthorAuthOptions {
  mode: 'sso' | 'local'
  owner: string
  edgeSecret: string
  publicBaseUrl: string
  localAuthor?: boolean
  environment?: 'development' | 'test' | 'production'
}

// Bonifacio ops/sso/role-contract.json v2. The edge broker projects runtime
// catalog grants to these committed application groups before forwarding.
const canonicalRolePrefixes = new Set(['user', 'user,admin', 'user,admin,chief-admin'])
const applicationGroups = [
  'access-react',
  'access-vue',
  'access-dukkeobi',
  'access-ddit-finalproject',
  'access-monitor',
  'access-pilgrimage',
  'access-multtara',
  'access-feelmyrythm',
  'access-garak',
]
const secretPattern = /^[A-Za-z0-9_-]{43,128}$/
const localCsrfSecret = randomBytes(48)
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])

function hasCanonicalGroups(value: string): boolean {
  const groups = value.split(',')
  const markerIndex = groups.indexOf('portfolio-v2')
  if (markerIndex < 1 || !canonicalRolePrefixes.has(groups.slice(0, markerIndex).join(','))) {
    return false
  }
  // A chief administrator has implicit access and must have no explicit grants.
  if (markerIndex === 3) return groups.length === 4

  let previousIndex = -1
  for (const group of groups.slice(markerIndex + 1)) {
    const index = applicationGroups.indexOf(group)
    // Exact membership and ascending order also reject duplicates, whitespace,
    // unknown groups, misplaced roles/markers, and empty segments.
    if (index <= previousIndex) return false
    previousIndex = index
  }
  return true
}

export const authorLogRedactions = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["remote-user"]',
  'req.headers["remote-email"]',
  'req.headers["remote-name"]',
  'req.headers["remote-groups"]',
  'req.headers["x-portfolio-edge-secret"]',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
]

function sameSecret(actual: string | undefined, expected: string): boolean {
  if (!actual) return false
  const actualBytes = Buffer.from(actual)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

function publicOrigin(options: AuthorAuthOptions): string | undefined {
  try {
    const url = new URL(options.publicBaseUrl)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname.replace(/\/$/, '') !== '/blog'
    ) {
      return undefined
    }
    return url.origin
  } catch {
    return undefined
  }
}

function localAuthorEnabled(options: AuthorAuthOptions): boolean {
  if (
    options.mode !== 'local' ||
    options.localAuthor !== true ||
    (options.environment ?? process.env.NODE_ENV) === 'production'
  ) {
    return false
  }
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(options.publicBaseUrl).hostname)
  } catch {
    return false
  }
}

function configured(options: AuthorAuthOptions | undefined): options is AuthorAuthOptions {
  if (!options || !options.owner || !publicOrigin(options)) return false
  if (options.mode === 'local') return localAuthorEnabled(options)
  return (
    options.mode === 'sso' &&
    secretPattern.test(options.edgeSecret) &&
    new URL(options.publicBaseUrl).protocol === 'https:'
  )
}

function csrfToken(options: AuthorAuthOptions): string {
  return createHmac('sha256', options.mode === 'local' ? localCsrfSecret : options.edgeSecret)
    .update(JSON.stringify(['blog-author-csrf-v1', options.owner, publicOrigin(options)]))
    .digest('base64url')
}

/** Call only from an endpoint protected by createAuthorGuard with the same options. */
export function authorSession(options?: AuthorAuthOptions): { user: string; csrfToken: string } {
  if (!configured(options)) throw new Error('Author is not configured')
  return { user: options.owner, csrfToken: csrfToken(options) }
}

export function createAuthorGuard(options?: AuthorAuthOptions): onRequestAsyncHookHandler {
  return async (request, reply) => {
    if (!configured(options)) {
      return reply.status(503).send({ error: 'author_unavailable' })
    }

    if (options.mode === 'local') {
      // A forwarded IP is caller-controlled without the SSO boundary. Inspect the socket.
      const peer = request.raw.socket.remoteAddress
      if (
        !peer ||
        !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer) ||
        request.headers.host !== new URL(options.publicBaseUrl).host
      ) {
        return reply.status(403).send({ error: 'author_forbidden' })
      }
    } else {
      const user = request.headers['remote-user']
      if (typeof user !== 'string' || !user) {
        return reply.status(401).send({ error: 'login_required' })
      }
      const secret = request.headers['x-portfolio-edge-secret']
      const groups = request.headers['remote-groups']
      if (
        typeof secret !== 'string' ||
        !sameSecret(secret, options.edgeSecret) ||
        user !== options.owner ||
        typeof groups !== 'string' ||
        !hasCanonicalGroups(groups)
      ) {
        return reply.status(403).send({ error: 'author_forbidden' })
      }
    }

    const mutation = !safeMethods.has(request.method)
    const origin = request.headers.origin
    if ((mutation || origin !== undefined) && origin !== publicOrigin(options)) {
      return reply.status(403).send({ error: 'invalid_origin' })
    }
    if (mutation) {
      const token = request.headers['x-csrf-token']
      if (typeof token !== 'string' || !sameSecret(token, csrfToken(options))) {
        return reply.status(403).send({ error: 'invalid_csrf_token' })
      }
    }
  }
}
