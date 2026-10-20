import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')

function cssBlock(marker: string, occurrence = 0): string {
  let markerIndex = -1
  for (let index = 0; index <= occurrence; index += 1) {
    markerIndex = styles.indexOf(marker, markerIndex + 1)
  }
  if (markerIndex < 0) throw new Error(`Missing CSS marker: ${marker}`)
  const openingBrace = styles.indexOf('{', markerIndex)
  let depth = 0
  for (let index = openingBrace; index < styles.length; index += 1) {
    if (styles[index] === '{') depth += 1
    if (styles[index] === '}') depth -= 1
    if (depth === 0) return styles.slice(openingBrace + 1, index)
  }
  throw new Error(`Unclosed CSS block: ${marker}`)
}

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map(
    (offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255,
  )
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!
}

function contrastRatio(foreground: string, background: string): number {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (left, right) => right - left,
  )
  return (values[0]! + 0.05) / (values[1]! + 0.05)
}

describe('responsive CSS contracts', () => {
  it('bounds the canvas, respects safe areas, and reflows tiles on smaller screens', () => {
    const root = compact(cssBlock(':root'))
    const mobile = compact(cssBlock('@media (max-width: 900px)'))
    const phone = compact(cssBlock('@media (max-width: 600px)'))

    expect(root).toContain('--content-max: 86rem')
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      expect(root).toContain(`--safe-${edge}: env(safe-area-inset-${edge}, 0px)`)
    }
    expect(compact(cssBlock('.post-tiles'))).toContain('repeat(4, minmax(0, 1fr))')
    expect(mobile).toContain('repeat(2, minmax(0, 1fr))')
    expect(mobile).toContain('.article-aside, .article-aside.empty { display: none; }')
    expect(phone).toContain('grid-template-columns: minmax(0, 1fr)')
    expect(indexHtml).toMatch(/viewport-fit=cover/)
  })

  it('keeps long prose wrapped while code and tables own their horizontal overflow', () => {
    const articleTitle = compact(cssBlock('.article-header h1'))
    const postCopy = compact(cssBlock('.post-copy strong'))
    const pre = compact(cssBlock('.article-content pre', 1))
    const preCode = compact(cssBlock('.article-content pre code'))
    const table = compact(cssBlock('.article-content table'))

    expect(articleTitle).toContain('overflow-wrap: anywhere')
    expect(articleTitle).toContain('word-break: break-word')
    expect(postCopy).toContain('overflow-wrap: anywhere')
    expect(pre).toContain('max-width: 100%')
    expect(pre).toContain('overflow: auto')
    expect(preCode).toContain('white-space: pre')
    expect(preCode).toContain('overflow-wrap: normal')
    expect(table).toContain('overflow-x: auto')
  })

  it('keeps modal headers and footers fixed while their result and navigation regions scroll', () => {
    const searchDialog = compact(cssBlock('.search-dialog'))
    const searchPanel = compact(cssBlock('.search-panel'))
    const searchScroll = compact(cssBlock('.search-scroll'))
    const mobile = compact(cssBlock('@media (max-width: 900px)'))

    expect(searchDialog).toContain('height: 100dvh')
    expect(searchDialog).toContain('overflow: hidden')
    expect(searchPanel).toContain('grid-template-rows: auto minmax(0, 1fr)')
    expect(searchScroll).toContain('overflow-y: auto')
    expect(mobile).toContain('grid-template-rows: auto 1fr auto')
    expect(mobile).toContain('.mobile-category-nav { display: grid;')
    expect(mobile).toContain('overflow-y: auto')
  })

  it('provides short-height and reduced-motion modes without removing information', () => {
    const shortScreen = compact(cssBlock('@media (max-height: 700px)'))
    const reducedMotion = compact(cssBlock('@media (prefers-reduced-motion: reduce)'))

    expect(shortScreen).toContain('.search-panel form { margin-top: 1.5rem; }')
    expect(shortScreen).toContain('.mobile-category-nav a { min-height: 2.75rem;')
    expect(reducedMotion).toContain('animation-duration: 0.01ms !important')
    expect(reducedMotion).toContain('animation-delay: 0ms !important')
    expect(reducedMotion).toContain('transition-duration: 0.01ms !important')
    expect(reducedMotion).toContain('transition-delay: 0ms !important')
  })

  it('keeps actual text and focus colors above their contrast thresholds', () => {
    const root = cssBlock(':root')
    const token = (name: string) => {
      const match = root.match(new RegExp(`--${name}: (#[0-9a-f]{6})`))
      if (!match?.[1]) throw new Error(`Missing color token: ${name}`)
      return match[1]
    }
    for (const foreground of ['paper', 'muted', 'accent', 'mint']) {
      expect(contrastRatio(token(foreground), token('ink'))).toBeGreaterThanOrEqual(4.5)
    }
    for (const tileBackground of ['accent', 'mint']) {
      expect(contrastRatio(token('ink'), token(tileBackground))).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrastRatio(token('accent'), token('ink'))).toBeGreaterThanOrEqual(3)
    expect(compact(cssBlock('.category-nav a small'))).toContain('color: var(--muted)')
    expect(compact(cssBlock('.post-tiles .tone-0 .post-row'))).toContain('color: var(--ink)')
  })
})
