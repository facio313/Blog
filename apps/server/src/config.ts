import path from 'node:path'
import { z } from 'zod'

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

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): BlogConfig {
  const parsed = environmentSchema.parse(environment)
  const publicUrl = new URL(parsed.BLOG_PUBLIC_BASE_URL)

  if (parsed.NODE_ENV === 'production') {
    if (publicUrl.protocol !== 'https:' || publicUrl.pathname.replace(/\/$/, '') !== '/blog') {
      throw new Error('BLOG_PUBLIC_BASE_URL must be the HTTPS /blog URL in production')
    }
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
    logLevel: parsed.BLOG_LOG_LEVEL,
  }
}
