import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { buildSeedBundle } from '../src/content/importer.js'
import { redactSensitiveContent } from '../src/content/redaction.js'
import { renderContent, stripMarkup } from '../src/content/render.js'
import type { SeedBundle } from '../src/types.js'

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url))
const temporaryDirectories: string[] = []

async function makeTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

async function writeFixture(root: string, relativePath: string, content: string | Buffer) {
  const target = path.join(root, relativePath)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, content)
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function groupBy<T>(values: T[], keyFor: (value: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {}
  for (const value of values) {
    const key = keyFor(value)
    const group = groups[key] ?? []
    group.push(value)
    groups[key] = group
  }
  return groups
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  )
})

describe('content bundle contract', () => {
  it('preserves the audited import policy totals and unique public identities', async () => {
    const bundle = JSON.parse(
      await readFile(path.join(workspaceRoot, 'content/seed/posts.json'), 'utf8'),
    ) as SeedBundle

    expect(bundle.counts).toEqual({
      discovered: 195,
      imported: 121,
      published: 32,
      review: 80,
      skipped: 74,
    })
    expect(bundle.posts).toHaveLength(121)
    expect(bundle.skipped).toHaveLength(74)

    const statusCounts = groupBy(bundle.posts, (post) => post.status)
    expect(statusCounts.published).toHaveLength(32)
    expect(statusCounts.review).toHaveLength(80)
    expect(statusCounts.draft).toHaveLength(8)
    expect(statusCounts.quarantined).toHaveLength(1)

    const formatCounts = groupBy(bundle.posts, (post) => post.contentFormat)
    expect(formatCounts.markdown).toHaveLength(112)
    expect(formatCounts.html).toHaveLength(8)
    expect(formatCounts.text).toHaveLength(1)

    expect(new Set(bundle.posts.map((post) => post.slug)).size).toBe(bundle.posts.length)
    expect(new Set(bundle.posts.map((post) => post.sourcePath)).size).toBe(bundle.posts.length)
    expect(
      bundle.posts.every((post) => post.sourcePathNfc === post.sourcePathNfc.normalize('NFC')),
    ).toBe(true)

    const quarantine = bundle.posts.find((post) => post.status === 'quarantined')
    expect(quarantine?.sourcePathNfc).toBe('Web/ㅁ http vs https.md')
    expect(quarantine?.contentRaw.includes('[REDACTED BY IMPORTER]')).toBe(true)
    const containsCredentialLikeNgrokCommand = /add-authtoken\s+[A-Za-z0-9_-]{20,}/i.test(
      quarantine?.contentRaw ?? '',
    )
    expect(containsCredentialLikeNgrokCommand).toBe(false)

    const skippedReasons = groupBy(bundle.skipped, (item) => item.reason)
    expect(skippedReasons['blank or metadata-only content']).toHaveLength(48)
    expect(skippedReasons['no renderable text']).toHaveLength(19)
    expect(skippedReasons['supporting artifact (.pdf)']).toHaveLength(2)
    expect(skippedReasons['supporting artifact (.sql)']).toHaveLength(2)
    expect(skippedReasons['supporting artifact (.csv)']).toHaveLength(1)
    expect(skippedReasons['supporting artifact (.json)']).toHaveLength(1)
    expect(skippedReasons['supporting artifact (.xml)']).toHaveLength(1)
  })
})

describe('buildSeedBundle', () => {
  it('classifies, normalizes, redacts, dates, and assigns slugs deterministically', async () => {
    const fixtureRoot = await makeTemporaryDirectory('bonifacio-importer-')
    const sourceRoot = path.join(fixtureRoot, '_posts')
    const policyPath = path.join(fixtureRoot, 'policy.json')
    const fakeNgrokToken = 'N'.repeat(32)
    const fakePassword = 'fixture-password'
    const nfdDiaryPath = '일지/2022-08-25-기록.md'.normalize('NFD')

    await writeFile(
      policyPath,
      JSON.stringify({
        schemaVersion: 1,
        categoryAliases: { 'Design Pattern': 'DesignPattern' },
        quarantinePaths: ['Web/secret.md'],
        reviewPaths: ['Java/review.md'],
      }),
    )
    await writeFixture(
      sourceRoot,
      '2023-01-02-Web.md',
      `---
layout: post
title: Web
date: 2023-01-01
published: true
categories: Design Pattern
tags: [Java, java, 보안]
---
# 소개
List<String>과 <br>을 표시한다.
`,
    )
    await writeFixture(
      sourceRoot,
      'Web/ㅁ Web.md',
      `---
layout: post
title: Web
date: 2023-01-02
published: true
categories: Web
---
# 두 번째 Web
본문
`,
    )
    await writeFixture(
      sourceRoot,
      nfdDiaryPath,
      `---
layout: post
title: 기록
date: 2022-08-25 19:51:07
published: false
categories: 일지
tags: [일지]
---
# 비공개 기록
본문
`,
    )
    await writeFixture(
      sourceRoot,
      'Web/secret.md',
      `# 터널 메모\nngrok config add-authtoken ${fakeNgrokToken}\n`,
    )
    await writeFixture(
      sourceRoot,
      'Java/review.md',
      `---
title: 검토
date: 2023-02-01
published: true
categories: Java
---
# 검토
password="${fakePassword}"
`,
    )
    await writeFixture(
      sourceRoot,
      'bad.md',
      `---
title:
published: true
tags: [unterminated
---
# 복구된 제목
본문
`,
    )
    await writeFixture(sourceRoot, 'plain.md', '# 프론트매터 없는 글\n본문\n')
    await writeFixture(
      sourceRoot,
      'demo.html',
      '<!doctype html><body><h1>Demo</h1><form>unsafe</form><script>alert(1)</script></body>',
    )
    await writeFixture(sourceRoot, 'script-only.html', '<script>alert(1)</script>')
    await writeFixture(sourceRoot, 'note.text', 'plain text note')
    await writeFixture(sourceRoot, 'UPPER.MD', '# uppercase markdown extension\n')
    await writeFixture(sourceRoot, 'blank.md', '')
    await writeFixture(
      sourceRoot,
      'metadata.md',
      '---\ntitle: metadata only\npublished: true\n---\n',
    )
    await writeFixture(sourceRoot, 'asset.pdf', Buffer.from('%PDF-fixture'))
    await writeFixture(sourceRoot, 'unsupported.bin', Buffer.from('fixture'))
    await writeFixture(sourceRoot, 'invalid.md', Buffer.from([0xff, 0xfe]))
    await writeFixture(sourceRoot, 'empty.sql', '')

    const first = await buildSeedBundle({ sourceRoot, policyPath })
    const second = await buildSeedBundle({ sourceRoot, policyPath })

    expect(second).toEqual(first)
    expect(first.counts).toEqual({
      discovered: 17,
      imported: 10,
      published: 2,
      review: 6,
      skipped: 7,
    })
    expect(groupBy(first.posts, (post) => post.status).draft).toHaveLength(1)
    expect(groupBy(first.posts, (post) => post.status).quarantined).toHaveLength(1)

    const collisionPosts = first.posts.filter((post) => post.slug.startsWith('web--'))
    expect(collisionPosts).toHaveLength(2)
    for (const post of collisionPosts) {
      expect(post.slug).toBe(`web--${sha256(post.sourcePathNfc).slice(0, 8)}`)
    }

    const aliased = first.posts.find((post) => post.sourcePathNfc === '2023-01-02-Web.md')
    expect(aliased).toMatchObject({
      category: 'DesignPattern',
      publishedAt: '2022-12-31T15:00:00.000Z',
      status: 'published',
    })
    expect(aliased?.reviewReasons).toContain('date conflict')
    expect(aliased?.contentHtml).toContain('&lt;String&gt;')
    expect(aliased?.contentHtml).toContain('<br>')

    const diary = first.posts.find((post) => post.title === '기록')
    expect(diary?.sourcePath).not.toBe(diary?.sourcePathNfc)
    expect(diary?.sourcePathNfc).toBe('일지/2022-08-25-기록.md')
    expect(diary?.publishedAt).toBe('2022-08-25T10:51:07.000Z')

    const quarantined = first.posts.find((post) => post.status === 'quarantined')
    expect(quarantined?.contentRaw.includes(fakeNgrokToken)).toBe(false)
    expect(quarantined?.contentHtml.includes(fakeNgrokToken)).toBe(false)
    expect(quarantined?.reviewReasons).toContain('quarantined credential finding')

    const reviewed = first.posts.find((post) => post.sourcePathNfc === 'Java/review.md')
    expect(reviewed?.status).toBe('review')
    expect(reviewed?.contentRaw.includes(fakePassword)).toBe(false)
    expect(reviewed?.reviewReasons).toContain('manual credential review required')

    expect(first.skipped).toEqual(
      expect.arrayContaining([
        { sourcePath: 'asset.pdf', reason: 'supporting artifact (.pdf)' },
        { sourcePath: 'empty.sql', reason: 'supporting artifact (.sql)' },
        { sourcePath: 'invalid.md', reason: 'invalid UTF-8' },
        { sourcePath: 'script-only.html', reason: 'no renderable text' },
        { sourcePath: 'unsupported.bin', reason: 'unsupported extension (.bin)' },
      ]),
    )
  })
})

describe('redactSensitiveContent', () => {
  it('covers each credential class without changing safe technical prose', () => {
    const fakeNgrokToken = 'T'.repeat(32)
    const fakeCloudKey = `AKIA${'Z'.repeat(16)}`
    const fakePrivateKeyBody = 'fixture-private-key-material'
    const fakePassword = 'fixturePassword'
    const fakeUrlPassword = 'fixtureUrlPassword'
    const input = [
      `ngrok config add-authtoken ${fakeNgrokToken}`,
      `password="${fakePassword}"`,
      `postgresql://reader:${fakeUrlPassword}@db.invalid/blog`,
      fakeCloudKey,
      `-----BEGIN PRIVATE KEY-----\n${fakePrivateKeyBody}\n-----END PRIVATE KEY-----`,
      'pwd : 현재 경로를 출력하는 명령',
      'passwordEncoder는 해시 도구다',
      'secret key라는 개념을 설명한다',
    ].join('\n')

    const result = redactSensitiveContent(input)

    for (const sensitiveValue of [
      fakeNgrokToken,
      fakeCloudKey,
      fakePrivateKeyBody,
      fakePassword,
      fakeUrlPassword,
    ]) {
      expect(result.content.includes(sensitiveValue)).toBe(false)
    }
    expect(result.content).toContain('pwd : 현재 경로를 출력하는 명령')
    expect(result.content).toContain('passwordEncoder는 해시 도구다')
    expect(result.content).toContain('secret key라는 개념을 설명한다')
    expect(result.reasons).toEqual([
      'cloud access key',
      'credential in connection URL',
      'credential-like assignment',
      'credential-like ngrok token',
      'private key material',
    ])
  })

  it('is idempotent so regeneration cannot corrupt the redaction marker', () => {
    const first = redactSensitiveContent('password=fixturePassword')
    const second = redactSensitiveContent(first.content)

    expect(second.content).toBe(first.content)
    expect(second.reasons).toEqual([])
  })
})

describe('renderContent', () => {
  it('escapes raw Markdown HTML, preserves safe breaks, templates, code, and unique headings', () => {
    const rendered = renderContent(
      `# 반복 제목
# 반복 제목

List<String>

<script>alert('unsafe')</script>

<br>

{{ vueValue }}

\`\`\`html
<script>insideCode()</script>
\`\`\`
`,
      'markdown',
    )

    expect(rendered).not.toContain('<script>')
    expect(rendered).toContain('&lt;script&gt;')
    expect(rendered).toContain('&lt;String&gt;')
    expect(rendered).toContain('<br>')
    expect(rendered).toContain('{{ vueValue }}')
    expect(rendered).toContain('id="반복-제목"')
    expect(rendered).toContain('id="반복-제목-2"')
  })

  it('turns executable HTML into sanitized static body content', () => {
    const rendered = renderContent(
      `<!doctype html><html><head><style>body{display:none}</style></head><body>
        <h1>Demo</h1>
        <form><input value="private"><button>submit</button></form>
        <a href="https://example.com" onclick="steal()">external</a>
        <iframe src="https://example.com"></iframe>
        <script>alert('unsafe')</script>
      </body></html>`,
      'html',
    )

    expect(rendered).toContain('<h1 id="demo">Demo</h1>')
    expect(rendered).toContain('target="_blank"')
    expect(rendered).toContain('rel="noopener noreferrer"')
    expect(rendered).not.toContain('<script')
    expect(rendered).not.toContain('<style')
    expect(rendered).not.toContain('<form')
    expect(rendered).not.toContain('<iframe')
    expect(rendered).not.toContain('onclick')
    expect(rendered).not.toContain('private')
  })

  it('escapes plain text and produces stable searchable text', () => {
    const rendered = renderContent('<script>text only</script>\n\n두 번째 문단', 'text')

    expect(rendered).not.toContain('<script>')
    expect(rendered).toContain('&lt;script&gt;')
    expect(stripMarkup(rendered)).toBe('<script>text only</script> 두 번째 문단')
  })
})
