import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Pool, type PoolClient } from 'pg'

const migrationsDirectory = fileURLToPath(new URL('../migrations', import.meta.url))
const migrationLockId = 2_024_082_500

export function createPool(connectionString: string): Pool {
  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'bonifacio-blog',
  })
}

async function ensureMigrationTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
}

export async function migrateDatabase(pool: Pool): Promise<string[]> {
  const client = await pool.connect()
  const applied: string[] = []

  try {
    await client.query('SELECT pg_advisory_lock($1)', [migrationLockId])
    await ensureMigrationTable(client)

    const migrationNames = (await readdir(migrationsDirectory))
      .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
      .sort()

    for (const name of migrationNames) {
      const exists = await client.query<{ exists: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE name = $1) AS exists',
        [name],
      )
      if (exists.rows[0]?.exists) continue

      const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8')
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name])
        await client.query('COMMIT')
        applied.push(name)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [migrationLockId]).catch(() => undefined)
    client.release()
  }

  return applied
}

export async function assertDatabaseReady(pool: Pool): Promise<void> {
  await pool.query('SELECT 1')
}
