import { randomBytes } from 'node:crypto'
import { Pool } from 'pg'

const defaultAdminUrl = 'postgresql://localhost/postgres'

function adminUrlFromEnvironment(): string {
  return (
    process.env.BLOG_TEST_POSTGRES_ADMIN_URL || process.env.BLOG_DATABASE_URL || defaultAdminUrl
  )
}

function databaseUrlFromAdmin(adminUrl: string, databaseName: string): string {
  const parsed = new URL(adminUrl)
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('BLOG_TEST_POSTGRES_ADMIN_URL must use the postgres protocol')
  }
  parsed.pathname = `/${databaseName}`
  return parsed.toString()
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

export interface TestDatabase {
  databaseName: string
  databaseUrl: string
  drop(): Promise<void>
}

export async function createRandomTestDatabase(): Promise<TestDatabase> {
  const databaseName = `bonifacio_test_${process.pid}_${randomBytes(6).toString('hex')}`
  const adminUrl = adminUrlFromEnvironment()
  const adminPool = new Pool({
    connectionString: adminUrl,
    application_name: 'bonifacio-blog-tests-admin',
    max: 1,
    connectionTimeoutMillis: 5_000,
  })
  let created = false

  try {
    await adminPool.query('SELECT 1')
    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`)
    created = true
  } catch (error) {
    await adminPool.end().catch(() => undefined)
    const detail = error instanceof Error ? error.message : 'unknown PostgreSQL error'
    throw new Error(
      `Unable to create the isolated PostgreSQL test database. ` +
        `Ensure local PostgreSQL is running and BLOG_TEST_POSTGRES_ADMIN_URL names a ` +
        `database whose role has CREATEDB. PostgreSQL reported: ${detail}`,
    )
  }

  return {
    databaseName,
    databaseUrl: databaseUrlFromAdmin(adminUrl, databaseName),
    async drop(): Promise<void> {
      try {
        if (!created) return
        await adminPool.query(
          `
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = $1 AND pid <> pg_backend_pid()
          `,
          [databaseName],
        )
        await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`)
        const remaining = await adminPool.query<{ exists: boolean }>(
          'SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists',
          [databaseName],
        )
        if (remaining.rows[0]?.exists) {
          throw new Error(`PostgreSQL test database cleanup failed for ${databaseName}`)
        }
        created = false
      } finally {
        await adminPool.end()
      }
    },
  }
}
