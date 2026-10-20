import { mkdtempSync, chmodSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Fastify from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { authorSession, createAuthorGuard, type AuthorAuthOptions } from '../src/author-auth.js'
import { loadConfig } from '../src/config.js'

const options: AuthorAuthOptions = {
  mode: 'sso',
  owner: 'cks',
  edgeSecret: 'A'.repeat(64),
  publicBaseUrl: 'https://bonifacio.work/blog',
  environment: 'test',
}
const identity = {
  'remote-user': 'cks',
  'remote-groups': 'user,admin,chief-admin,portfolio-v2',
  'x-portfolio-edge-secret': options.edgeSecret,
}
const mutationHeaders = {
  ...identity,
  origin: 'https://bonifacio.work',
  'x-csrf-token': authorSession(options).csrfToken,
}
const openApps: ReturnType<typeof Fastify>[] = []
const temporaryDirectories: string[] = []

async function appFor(author?: AuthorAuthOptions) {
  const app = Fastify({ trustProxy: true })
  openApps.push(app)
  app.get('/public', async () => ({ public: true }))
  await app.register(async (protectedApp) => {
    protectedApp.addHook('onRequest', createAuthorGuard(author))
    protectedApp.get('/session', async () => {
      if (!author) throw new Error('guard must reject unconfigured authoring')
      return authorSession(author)
    })
    protectedApp.post('/posts', async () => ({ saved: true }))
    protectedApp.put('/posts', async () => ({ saved: true }))
  })
  return app
}

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('author authentication', () => {
  it('keeps public access while unconfigured authoring fails closed', async () => {
    for (const author of [undefined, { ...options, edgeSecret: '' }]) {
      const app = await appFor(author)
      expect((await app.inject('/public')).statusCode).toBe(200)
      const response = await app.inject('/session')
      expect(response.statusCode).toBe(503)
      expect(response.json()).toEqual({ error: 'author_unavailable' })
    }
  })

  it('requires authentication before parsing any write body', async () => {
    const app = await appFor(options)
    const response = await app.inject({
      method: 'POST',
      url: '/posts',
      headers: { 'content-type': 'application/json' },
      payload: 'not json',
    })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'login_required' })
  })

  it.each([
    'user,portfolio-v2',
    'user,admin,portfolio-v2',
    'user,admin,chief-admin,portfolio-v2',
    'user,portfolio-v2,access-react,access-monitor',
    'user,admin,portfolio-v2,access-feelmyrythm,access-garak',
    'user,portfolio-v2,access-react,access-vue,access-dukkeobi,access-ddit-finalproject,access-monitor,access-pilgrimage,access-multtara,access-feelmyrythm,access-garak',
  ])('accepts the exact owner with canonical v2 roles and grants %s', async (groups) => {
    const app = await appFor(options)
    const response = await app.inject({
      url: '/session',
      headers: { ...identity, 'remote-groups': groups },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual(authorSession(options))
    expect(response.headers['set-cookie']).toBeUndefined()
    expect(response.body).not.toContain(options.edgeSecret)
  })

  it.each([
    { 'remote-user': 'another-user' },
    { 'remote-user': 'CKS' },
    { 'remote-user': 'cks@example.com' },
    { 'x-portfolio-edge-secret': '' },
    { 'x-portfolio-edge-secret': 'B'.repeat(64) },
    { 'remote-groups': '' },
    { 'remote-groups': 'user' },
    { 'remote-groups': 'user,developer' },
    { 'remote-groups': 'user,developer,admin' },
    { 'remote-groups': 'admin' },
    { 'remote-groups': 'users,owners' },
    { 'remote-groups': 'user,admin' },
    { 'remote-groups': 'developer,user' },
    { 'remote-groups': 'user,developer,developer' },
    { 'remote-groups': 'user, developer' },
    { 'remote-groups': 'user,developer,' },
    { 'remote-groups': 'user,,developer' },
    { 'remote-groups': 'user,admin,chief-admin' },
    { 'remote-groups': 'user,chief-admin,portfolio-v2' },
    { 'remote-groups': 'user,developer,portfolio-v2' },
    { 'remote-groups': 'user,portfolio-v2,admin' },
    { 'remote-groups': 'user,admin,admin,portfolio-v2' },
    { 'remote-groups': 'user,admin,chief-admin,portfolio-v2,access-react' },
    { 'remote-groups': 'user,portfolio-v2,portfolio-v2' },
    { 'remote-groups': 'user,Portfolio-v2' },
    { 'remote-groups': 'user,portfolio-v2,access-blog' },
    { 'remote-groups': 'user,portfolio-v2,access-pongdang' },
    { 'remote-groups': 'user,portfolio-v2,access-react,access-react' },
    { 'remote-groups': 'user,portfolio-v2,access-garak,access-react' },
    { 'remote-groups': 'user,portfolio-v2, access-react' },
    { 'remote-groups': 'user,portfolio-v2,access-react,' },
    { 'remote-groups': 'user,portfolio-v2,,access-react' },
  ])('rejects forged identity, secret, and malformed groups (%j)', async (headers) => {
    const app = await appFor(options)
    const response = await app.inject({
      url: '/session',
      headers: { ...identity, ...headers },
    })
    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'author_forbidden' })
  })

  it.each(['POST', 'PUT'] as const)('requires exact origin and CSRF for %s', async (method) => {
    const app = await appFor(options)
    expect((await app.inject({ method, url: '/posts', headers: mutationHeaders })).statusCode).toBe(
      200,
    )
    for (const origin of ['', 'null', 'https://attacker.invalid', 'https://bonifacio.work/']) {
      const response = await app.inject({
        method,
        url: '/posts',
        headers: { ...mutationHeaders, origin },
      })
      expect(response.statusCode).toBe(403)
      expect(response.json()).toEqual({ error: 'invalid_origin' })
    }
    const noOrigin = await app.inject({
      method,
      url: '/posts',
      headers: { ...identity, 'x-csrf-token': mutationHeaders['x-csrf-token'] },
    })
    expect(noOrigin.json()).toEqual({ error: 'invalid_origin' })
    for (const token of ['', 'forged', authorSession({ ...options, owner: 'other' }).csrfToken]) {
      const response = await app.inject({
        method,
        url: '/posts',
        headers: { ...mutationHeaders, 'x-csrf-token': token },
      })
      expect(response.statusCode).toBe(403)
      expect(response.json()).toEqual({ error: 'invalid_csrf_token' })
    }
  })

  it('rejects a foreign origin on session reads and never derives origin from Host', async () => {
    const app = await appFor(options)
    const response = await app.inject({
      url: '/session',
      headers: { ...identity, host: 'attacker.invalid', origin: 'https://attacker.invalid' },
    })
    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'invalid_origin' })
  })
})

describe('explicit native local preview', () => {
  const local: AuthorAuthOptions = {
    ...options,
    mode: 'local',
    edgeSecret: '',
    localAuthor: true,
    publicBaseUrl: 'http://127.0.0.1:5176/blog',
  }

  it('permits local preview only from the loopback socket with origin and CSRF', async () => {
    const app = await appFor(local)
    const session = await app.inject({
      url: '/session',
      remoteAddress: '127.0.0.1',
      headers: { host: '127.0.0.1:5176' },
    })
    expect(session.statusCode).toBe(200)
    const token = session.json<{ csrfToken: string }>().csrfToken
    expect(
      (
        await app.inject({
          url: '/posts',
          method: 'POST',
          remoteAddress: '127.0.0.1',
          headers: {
            host: '127.0.0.1:5176',
            origin: 'http://127.0.0.1:5176',
            'x-csrf-token': token,
          },
        })
      ).statusCode,
    ).toBe(200)
    const remote = await app.inject({
      url: '/session',
      remoteAddress: '192.0.2.10',
      headers: { 'x-forwarded-for': '127.0.0.1' },
    })
    expect(remote.statusCode).toBe(403)
    expect(remote.json()).toEqual({ error: 'author_forbidden' })
    const rebound = await app.inject({
      url: '/session',
      remoteAddress: '127.0.0.1',
      headers: { host: 'attacker.invalid', 'x-forwarded-host': '127.0.0.1:5176' },
    })
    expect(rebound.statusCode).toBe(403)
    expect(rebound.json()).toEqual({ error: 'author_forbidden' })
  })

  it.each([
    { localAuthor: false },
    { environment: 'production' as const },
    { publicBaseUrl: 'https://bonifacio.work/blog' },
    { publicBaseUrl: 'https://localhost.attacker.invalid/blog' },
  ])('does not enable preview outside the explicit local boundary (%j)', async (change) => {
    const app = await appFor({ ...local, ...change })
    expect((await app.inject('/session')).statusCode).toBe(503)
  })
})

describe('author startup configuration', () => {
  const baseEnvironment = {
    PORTFOLIO_BRANCH: 'codex',
    PORTFOLIO_AUTH_MODE: 'local',
    NODE_ENV: 'test',
    BLOG_HOST: '127.0.0.1',
    BLOG_PUBLIC_BASE_URL: 'http://127.0.0.1:5176/blog',
  }

  it('uses the canonical branch resolver for direct startup and defaults preview off', () => {
    expect(loadConfig(baseEnvironment).author).toMatchObject({
      owner: 'cks',
      mode: 'local',
      localAuthor: false,
    })
    expect(() => loadConfig({ ...baseEnvironment, PORTFOLIO_BRANCH: 'main' })).toThrow(
      'Portfolio branch authentication contract failed',
    )
    expect(() => loadConfig({ ...baseEnvironment, PORTFOLIO_AUTH_MODE: 'sso' })).toThrow(
      'Portfolio branch authentication contract failed',
    )
    expect(
      loadConfig({
        ...baseEnvironment,
        PORTFOLIO_BRANCH: 'main',
        PORTFOLIO_AUTH_MODE: 'sso',
        BLOG_PUBLIC_BASE_URL: 'https://bonifacio.work/blog',
      }).author.mode,
    ).toBe('sso')
  })

  it.each([
    { BLOG_HOST: '0.0.0.0' },
    { BLOG_PUBLIC_BASE_URL: 'https://bonifacio.work/blog' },
    { NODE_ENV: 'production', BLOG_PUBLIC_BASE_URL: 'https://127.0.0.1/blog' },
    { PORTFOLIO_BRANCH: 'main', PORTFOLIO_AUTH_MODE: 'sso' },
  ])('rejects unsafe local author startup (%j)', (change) => {
    expect(() => loadConfig({ ...baseEnvironment, BLOG_LOCAL_AUTHOR: 'true', ...change })).toThrow(
      'BLOG_LOCAL_AUTHOR requires',
    )
  })

  it('loads a private file, refuses ambiguous sources and rejects exposed or symlinked files', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'blog-author-auth-'))
    temporaryDirectories.push(directory)
    const secretPath = path.join(directory, 'secret')
    const symlinkPath = path.join(directory, 'link')
    writeFileSync(secretPath, `${options.edgeSecret}\n`, { mode: 0o600 })
    const environment = { ...baseEnvironment, BLOG_SSO_EDGE_SECRET_FILE: secretPath }
    expect(loadConfig(environment).author.edgeSecret).toBe(options.edgeSecret)
    chmodSync(secretPath, 0o640)
    expect(loadConfig(environment).author.edgeSecret).toBe(options.edgeSecret)
    expect(() => loadConfig({ ...environment, BLOG_SSO_EDGE_SECRET: options.edgeSecret })).toThrow(
      'Set only one',
    )
    chmodSync(secretPath, 0o644)
    expect(() => loadConfig(environment)).toThrow('private regular file')
    chmodSync(secretPath, 0o600)
    symlinkSync(secretPath, symlinkPath)
    expect(() => loadConfig({ ...environment, BLOG_SSO_EDGE_SECRET_FILE: symlinkPath })).toThrow(
      'private regular file',
    )
  })

  it.each([
    'https://bonifacio.work/blog?redirect=https://attacker.invalid',
    'https://bonifacio.work/blog#fragment',
    'https://user:password@bonifacio.work/blog',
    'ftp://bonifacio.work/blog',
  ])('rejects an ambiguous configured origin (%s)', (url) => {
    expect(() => loadConfig({ ...baseEnvironment, BLOG_PUBLIC_BASE_URL: url })).toThrow(
      'BLOG_PUBLIC_BASE_URL',
    )
  })
})
