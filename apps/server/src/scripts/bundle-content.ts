import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { buildSeedBundle } from '../content/importer.js'

function findWorkspaceRoot(): string {
  const current = path.resolve(process.cwd())
  return path.basename(current) === 'server' && path.basename(path.dirname(current)) === 'apps'
    ? path.resolve(current, '../..')
    : current
}

function valueAfter(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}

async function main(): Promise<void> {
  const workspaceRoot = findWorkspaceRoot()
  const args = process.argv.slice(2).filter((argument) => argument !== '--')
  const sourceRoot = valueAfter(args, '--source') || process.env.BLOG_POSTS_SOURCE_DIR
  if (!sourceRoot) {
    throw new Error('A source directory is required: --source /path/to/_posts')
  }

  const outputPath = path.resolve(
    valueAfter(args, '--output') || path.join(workspaceRoot, 'content/seed/posts.json'),
  )
  const policyPath = path.resolve(
    valueAfter(args, '--policy') || path.join(workspaceRoot, 'content/import-policy.json'),
  )
  const bundle = await buildSeedBundle({ sourceRoot, policyPath })

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8')

  process.stdout.write(
    `${JSON.stringify({ outputPath, counts: bundle.counts, schemaVersion: bundle.schemaVersion })}\n`,
  )
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown import error'
  process.stderr.write(`content bundle failed: ${message}\n`)
  process.exit(1)
})
