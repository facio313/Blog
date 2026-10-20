import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { constants, closeSync, existsSync, fstatSync, openSync, readFileSync } from 'node:fs'
import { z } from 'zod'
import type { AuthorAuthOptions } from './author-auth.js'

const booleanFromString = z
  .enum(['true', 'false'])
  .default('true')
  .transform((value) => value === 'true')

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BLOG_PORT: z.coerce.number().int().min(1).max(65_535).default(9176),
  BLOG_HOST: z.string().default('127.0.0.1'),
  BLOG_DATABASE_URL: z.string().min(1).default('postgresql://localhost/bonifacio_blog_dev'),
  BLOG_PUBLIC_BASE_URL: z.string().url().default('http://127.0.0.1:5176/blog'),
  BLOG_CONTENT_BUNDLE_PATH: z.string().default('content/seed/posts.json'),
  BLOG_AUTO_MIGRATE: booleanFromString,
  BLOG_SEED_ON_START: booleanFromString,
  BLOG_AUTHOR_USERNAME: z
    .string()
    .regex(/^[a-zA-Z0-9._-]{1,100}$/)
    .default('cks'),
  BLOG_LOCAL_AUTHOR: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  BLOG_SSO_EDGE_SECRET: z.string().default(''),
  BLOG_SSO_EDGE_SECRET_FILE: z.string().default(''),
  BLOG_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
})

export interface BlogConfig {
  environment: 'development' | 'test' | 'production'
  port: number
  host: string
  databaseUrl: string
  publicBaseUrl: string
  contentBundlePath: string
  autoMigrate: boolean
  seedOnStart: boolean
  author: AuthorAuthOptions
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
}

function workspaceRelativePath(value: string): string {
  if (path.isAbsolute(value)) return value
  const current = path.resolve(process.cwd())
  const workspaceRoot =
    path.basename(current) === 'server' && path.basename(path.dirname(current)) === 'apps'
      ? path.resolve(current, '../..')
      : current
  return path.resolve(workspaceRoot, value)
}

function resolveAuthenticationMode(environment: NodeJS.ProcessEnv): 'sso' | 'local' {
  const installedResolver = '/usr/local/bin/portfolio-auth-mode'
  const resolver = existsSync(installedResolver)
    ? installedResolver
    : workspaceRelativePath('scripts/portfolio-auth-mode.sh')
  try {
    const result = execFileSync('sh', [resolver, 'print'], {
      env: environment,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    if (result === 'sso' || result === 'local') return result
  } catch {
    // Do not serialize child-process errors: they may retain the environment.
    throw new Error(
      'Portfolio branch authentication contract failed; run scripts/portfolio-auth-mode.sh check',
    )
  }
  throw new Error('Portfolio authentication resolver returned an unsupported mode')
}

function readEdgeSecret(value: string, file: string): string {
  if (value && file) {
    throw new Error('Set only one of BLOG_SSO_EDGE_SECRET or BLOG_SSO_EDGE_SECRET_FILE')
  }
  if (!file) return value
  let descriptor: number | undefined
  try {
    descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW)
    const metadata = fstatSync(descriptor)
    if (
      !metadata.isFile() ||
      metadata.nlink !== 1 ||
      metadata.size > 256 ||
      (metadata.mode & 0o137) !== 0
    ) {
      throw new Error('unsafe secret file')
    }
    return readFileSync(descriptor, 'utf8').trim()
  } catch {
    throw new Error('BLOG_SSO_EDGE_SECRET_FILE must be a readable private regular file')
  } finally {
    if (descriptor !== undefined) closeSync(descriptor)
  }
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): BlogConfig {
  const parsed = environmentSchema.parse(environment)
  const publicUrl = new URL(parsed.BLOG_PUBLIC_BASE_URL)
  const mode = resolveAuthenticationMode(environment)
  const edgeSecret = readEdgeSecret(parsed.BLOG_SSO_EDGE_SECRET, parsed.BLOG_SSO_EDGE_SECRET_FILE)

  if (
    !['http:', 'https:'].includes(publicUrl.protocol) ||
    publicUrl.username ||
    publicUrl.password ||
    publicUrl.search ||
    publicUrl.hash ||
    publicUrl.pathname.replace(/\/$/, '') !== '/blog'
  ) {
    throw new Error(
      'BLOG_PUBLIC_BASE_URL must be an HTTP(S) /blog URL without credentials or query',
    )
  }
  if (parsed.NODE_ENV === 'production') {
    if (publicUrl.protocol !== 'https:' || publicUrl.pathname.replace(/\/$/, '') !== '/blog') {
      throw new Error('BLOG_PUBLIC_BASE_URL must be the HTTPS /blog URL in production')
    }
  }
  if (edgeSecret && !/^[A-Za-z0-9_-]{43,128}$/.test(edgeSecret)) {
    throw new Error('The Blog edge secret must contain 43–128 URL-safe random characters')
  }
  if (
    parsed.BLOG_LOCAL_AUTHOR &&
    (parsed.NODE_ENV === 'production' ||
      mode !== 'local' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(publicUrl.hostname) ||
      !['localhost', '127.0.0.1', '::1'].includes(parsed.BLOG_HOST))
  ) {
    throw new Error(
      'BLOG_LOCAL_AUTHOR requires local mode, nonproduction, and loopback host/origin',
    )
  }

  return {
    environment: parsed.NODE_ENV,
    port: parsed.BLOG_PORT,
    host: parsed.BLOG_HOST,
    databaseUrl: parsed.BLOG_DATABASE_URL,
    publicBaseUrl: parsed.BLOG_PUBLIC_BASE_URL.replace(/\/$/, ''),
    contentBundlePath: workspaceRelativePath(parsed.BLOG_CONTENT_BUNDLE_PATH),
    autoMigrate: parsed.BLOG_AUTO_MIGRATE,
    seedOnStart: parsed.BLOG_SEED_ON_START,
    author: {
      mode,
      owner: parsed.BLOG_AUTHOR_USERNAME,
      edgeSecret,
      publicBaseUrl: parsed.BLOG_PUBLIC_BASE_URL.replace(/\/$/, ''),
      localAuthor: parsed.BLOG_LOCAL_AUTHOR,
      environment: parsed.NODE_ENV,
    },
    logLevel: parsed.BLOG_LOG_LEVEL,
  }
}
