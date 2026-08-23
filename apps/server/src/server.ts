import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { buildApp } from './app.js'
import { loadConfig } from './config.js'
import { assertDatabaseReady, createPool, migrateDatabase } from './database.js'
import { seedFromBundle } from './seed.js'

const config = loadConfig()
const pool = createPool(config.databaseUrl)

async function start(): Promise<void> {
  await assertDatabaseReady(pool)
  if (config.autoMigrate) await migrateDatabase(pool)

  if (config.seedOnStart) {
    await access(config.contentBundlePath, constants.R_OK)
    await seedFromBundle(pool, config.contentBundlePath)
  }

  const app = await buildApp({
    pool,
    logger: { level: config.logLevel },
  })

  const close = async (signal: string) => {
    app.log.info({ signal }, 'shutting down')
    await app.close()
    await pool.end()
    process.exit(0)
  }

  process.on('SIGINT', () => void close('SIGINT'))
  process.on('SIGTERM', () => void close('SIGTERM'))

  await app.listen({ port: config.port, host: config.host })
}

start().catch(async (error: unknown) => {
  console.error('blog server failed to start', error)
  await pool.end().catch(() => undefined)
  process.exit(1)
})
