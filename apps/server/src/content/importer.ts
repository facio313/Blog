import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { JSON_SCHEMA, load as loadYaml } from 'js-yaml'
import { z } from 'zod'
import type { ContentFormat, PostStatus, SeedBundle, SeedPost } from '../types.js'
import { redactSensitiveContent } from './redaction.js'
import { renderContent, stripMarkup } from './render.js'

const policySchema = z.object({
  schemaVersion: z.literal(1),
  categoryAliases: z.record(z.string(), z.string()).default({}),
  quarantinePaths: z.array(z.string()).default([]),
  reviewPaths: z.array(z.string()).default([]),
})

type ImportPolicy = z.infer<typeof policySchema>

interface FrontmatterResult {
  body: string
  data: Record<string, unknown>
  hasFrontmatter: boolean
  parseError: boolean
  rawDate: string | null
}

interface CandidatePost extends Omit<SeedPost, 'slug'> {
  slugBase: string
}

const skippedArtifactExtensions = new Set(['.pdf', '.sql', '.csv', '.json', '.xml'])

function digest(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function compareNames(left: string, right: string): number {
  return Buffer.from(left).compare(Buffer.from(right))
}

async function listFiles(root: string, current = root): Promise<string[]> {
  const entries = (await readdir(current, { withFileTypes: true })).sort((left, right) =>
    compareNames(left.name, right.name),
  )
  const files: string[] = []

  for (const entry of entries) {
    const absolute = path.join(current, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) files.push(...(await listFiles(root, absolute)))
    if (entry.isFile()) files.push(absolute)
  }

  return files
}

function parseFrontmatter(source: string): FrontmatterResult {
  if (!/^---\r?\n/.test(source)) {
    return { body: source, data: {}, hasFrontmatter: false, parseError: false, rawDate: null }
  }

  const block = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/)
  const rawDate = block?.[1]?.match(/^date:\s*(.*?)\s*$/m)?.[1]?.replace(/^['"]|['"]$/g, '') ?? null

  if (!block) {
    return { body: source, data: {}, hasFrontmatter: true, parseError: true, rawDate }
  }
  const yamlBlock = block[1] ?? ''
  const body = block[2] ?? ''

  try {
    const parsed = loadYaml(yamlBlock, { schema: JSON_SCHEMA })
    const data =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {}
    return {
      body,
      data,
      hasFrontmatter: true,
      parseError: false,
      rawDate,
    }
  } catch {
    return {
      body,
      data: {},
      hasFrontmatter: true,
      parseError: true,
      rawDate,
    }
  }
}

function cleanFilenameTitle(sourcePathNfc: string): string {
  const extension = path.extname(sourcePathNfc)
  const stem = path.basename(sourcePathNfc, extension)
  return stem
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .replace(/^ㅁ\s*/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function firstMarkdownHeading(body: string): string | null {
  const match = body.match(/^#\s+(.+?)\s*$/m)
  return match?.[1]?.replace(/[*_`]/g, '').trim() || null
}

function coerceString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFC').replace(/\s+/g, ' ').trim()
  return normalized || null
}

function normalizeStringList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  return [
    ...new Set(
      values
        .map(coerceString)
        .filter((item): item is string => Boolean(item))
        .map((item) => item.slice(0, 80)),
    ),
  ]
}

function inferCategory(
  data: Record<string, unknown>,
  sourcePathNfc: string,
  policy: ImportPolicy,
): string {
  const declared = Array.isArray(data.categories)
    ? coerceString(data.categories[0])
    : coerceString(data.categories)
  const folder = sourcePathNfc.includes('/') ? sourcePathNfc.split('/')[0] : 'ETC'
  const category = declared || folder || 'ETC'
  return policy.categoryAliases[category] ?? category
}

function slugify(value: string): string {
  const result = value
    .normalize('NFC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 92)
  return result || 'untitled'
}

function filenameDate(sourcePathNfc: string): string | null {
  const stem = path.basename(sourcePathNfc, path.extname(sourcePathNfc))
  const dashed = stem.match(/^(\d{4}-\d{2}-\d{2})(?:-|$)/)?.[1]
  if (dashed) return dashed
  const compact = stem.match(/^(\d{4})(\d{2})(\d{2})$/)
  return compact ? `${compact[1]}-${compact[2]}-${compact[3]}` : null
}

function localDateToIso(value: string | null): string | null {
  if (!value) return null
  const clean = value.trim()
  const dateOnly = clean.match(/^(\d{4}-\d{2}-\d{2})$/)?.[1]
  const withoutZone = clean.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/)
  const candidate = dateOnly
    ? `${dateOnly}T00:00:00+09:00`
    : withoutZone
      ? `${withoutZone[1]}T${withoutZone[2]}+09:00`
      : clean
  const parsed = new Date(candidate)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function calculateReadingMinutes(plainText: string): number {
  const hangulCharacters = (plainText.match(/[가-힣]/g) ?? []).length
  const otherWords = (plainText.replace(/[가-힣]/g, ' ').match(/[\p{Letter}\p{Number}_]+/gu) ?? [])
    .length
  return Math.max(1, Math.ceil((hangulCharacters + otherWords * 2.2) / 500))
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1).trimEnd()}…`
}

function determineStatus(options: {
  format: ContentFormat
  frontmatter: FrontmatterResult
  sourcePathNfc: string
  policy: ImportPolicy
  redactionReasons: string[]
}): PostStatus {
  if (options.policy.quarantinePaths.includes(options.sourcePathNfc)) return 'quarantined'
  if (options.format !== 'markdown') return 'review'
  if (options.frontmatter.parseError) return 'review'
  if (options.policy.reviewPaths.includes(options.sourcePathNfc)) return 'review'
  if (options.redactionReasons.length > 0) return 'review'
  if (!options.frontmatter.hasFrontmatter) return 'review'
  if (options.frontmatter.data.published === false) return 'draft'
  if (options.frontmatter.data.published === true) return 'published'
  return 'review'
}

function classifyFormat(absolutePath: string): ContentFormat | null {
  const extension = path.extname(absolutePath).toLocaleLowerCase('en-US')
  if (extension === '.md') return 'markdown'
  if (extension === '.html') return 'html'
  if (extension === '.text' || extension === '') return 'text'
  return null
}

async function createCandidate(
  absolutePath: string,
  sourceRoot: string,
  policy: ImportPolicy,
): Promise<{
  post?: CandidatePost
  skipped?: { sourcePath: string; reason: string }
  mtime: Date
}> {
  const metadata = await stat(absolutePath)
  const sourcePath = path.relative(sourceRoot, absolutePath).split(path.sep).join('/')
  const sourcePathNfc = sourcePath.normalize('NFC')
  const extension = path.extname(absolutePath).toLocaleLowerCase('en-US')
  const format = classifyFormat(absolutePath)

  if (!format) {
    const reason = skippedArtifactExtensions.has(extension)
      ? `supporting artifact (${extension || 'no extension'})`
      : `unsupported extension (${extension || 'none'})`
    return { skipped: { sourcePath: sourcePathNfc, reason }, mtime: metadata.mtime }
  }

  const bytes = await readFile(absolutePath)
  const original = bytes.toString('utf8')
  if (original.includes('\uFFFD')) {
    return {
      skipped: { sourcePath: sourcePathNfc, reason: 'invalid UTF-8' },
      mtime: metadata.mtime,
    }
  }

  const frontmatter =
    format === 'markdown'
      ? parseFrontmatter(original)
      : { body: original, data: {}, hasFrontmatter: false, parseError: false, rawDate: null }
  if (!frontmatter.body.trim()) {
    return {
      skipped: { sourcePath: sourcePathNfc, reason: 'blank or metadata-only content' },
      mtime: metadata.mtime,
    }
  }

  const redacted = redactSensitiveContent(frontmatter.body)
  const rendered = renderContent(redacted.content, format)
  const plainText = stripMarkup(rendered)
  if (!plainText) {
    return {
      skipped: { sourcePath: sourcePathNfc, reason: 'no renderable text' },
      mtime: metadata.mtime,
    }
  }

  const filenameFallback = cleanFilenameTitle(sourcePathNfc)
  const title =
    coerceString(frontmatter.data.title) ||
    (format === 'markdown' ? firstMarkdownHeading(frontmatter.body) : null) ||
    filenameFallback ||
    '제목 없는 기록'
  const description = coerceString(frontmatter.data.description) || truncate(plainText, 180)
  const excerpt = truncate(plainText, 220)
  const category = inferCategory(frontmatter.data, sourcePathNfc, policy)
  const tags = normalizeStringList(frontmatter.data.tags)
  const fromFilename = filenameDate(sourcePathNfc)
  const fromFrontmatter = localDateToIso(frontmatter.rawDate)
  const publishedAt = fromFrontmatter || localDateToIso(fromFilename)
  const reviewReasons = new Set<string>(redacted.reasons)

  if (frontmatter.parseError) reviewReasons.add('frontmatter parse error')
  if (!frontmatter.hasFrontmatter && format === 'markdown') reviewReasons.add('missing frontmatter')
  if (format === 'html') reviewReasons.add('standalone executable HTML is review-only')
  if (format === 'text') reviewReasons.add('plain-text artifact is review-only')
  if (policy.reviewPaths.includes(sourcePathNfc))
    reviewReasons.add('manual credential review required')
  if (policy.quarantinePaths.includes(sourcePathNfc))
    reviewReasons.add('quarantined credential finding')
  if (frontmatter.rawDate && !fromFrontmatter) reviewReasons.add('invalid frontmatter date')
  if (fromFrontmatter && fromFilename) {
    const frontmatterDay = frontmatter.rawDate?.slice(0, 10)
    if (frontmatterDay && frontmatterDay !== fromFilename) reviewReasons.add('date conflict')
  }

  const status = determineStatus({
    format,
    frontmatter,
    sourcePathNfc,
    policy,
    redactionReasons: redacted.reasons,
  })
  const pathDigest = digest(sourcePathNfc)

  return {
    post: {
      id: pathDigest.slice(0, 32),
      slugBase: slugify(title),
      sourcePath,
      sourcePathNfc,
      sourceHash: digest(bytes),
      title,
      description,
      excerpt,
      category,
      tags,
      contentFormat: format,
      contentRaw: redacted.content,
      contentHtml: rendered,
      readingMinutes: calculateReadingMinutes(plainText),
      status,
      reviewReasons: [...reviewReasons].sort(),
      publishedAt,
      sourceUpdatedAt: metadata.mtime.toISOString(),
    },
    mtime: metadata.mtime,
  }
}

function assignStableSlugs(candidates: CandidatePost[]): SeedPost[] {
  const groups = new Map<string, CandidatePost[]>()
  for (const candidate of candidates) {
    const group = groups.get(candidate.slugBase) ?? []
    group.push(candidate)
    groups.set(candidate.slugBase, group)
  }

  return candidates.map(({ slugBase, ...candidate }) => ({
    ...candidate,
    slug:
      (groups.get(slugBase)?.length ?? 0) > 1
        ? `${slugBase}--${digest(candidate.sourcePathNfc).slice(0, 8)}`
        : slugBase,
  }))
}

export async function buildSeedBundle(options: {
  sourceRoot: string
  policyPath: string
}): Promise<SeedBundle> {
  const sourceRoot = path.resolve(options.sourceRoot)
  const policy = policySchema.parse(JSON.parse(await readFile(options.policyPath, 'utf8')))
  const files = await listFiles(sourceRoot)
  const candidates: CandidatePost[] = []
  const skipped: Array<{ sourcePath: string; reason: string }> = []
  let latestMtime = new Date(0)

  for (const absolutePath of files) {
    const result = await createCandidate(absolutePath, sourceRoot, policy)
    if (result.mtime > latestMtime) latestMtime = result.mtime
    if (result.post) candidates.push(result.post)
    if (result.skipped) skipped.push(result.skipped)
  }

  const posts = assignStableSlugs(candidates).sort((left, right) =>
    compareNames(left.sourcePath, right.sourcePath),
  )
  const published = posts.filter((post) => post.status === 'published').length
  const review = posts.filter((post) => post.status === 'review').length

  return {
    schemaVersion: 1,
    generatedAt: latestMtime.toISOString(),
    sourceRoot: '_posts',
    counts: {
      discovered: files.length,
      imported: posts.length,
      published,
      review,
      skipped: skipped.length,
    },
    posts,
    skipped: skipped.sort((left, right) => compareNames(left.sourcePath, right.sourcePath)),
  }
}
