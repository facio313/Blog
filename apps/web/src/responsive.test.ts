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
  it('uses a fluid rail, bounded content canvas, safe areas, and a tablet-first single column', () => {
    const root = compact(cssBlock(':root'))
    const compactDesktop = compact(cssBlock('@media (max-width: 1230px)'))
    const mobile = compact(cssBlock('@media (max-width: 900px)'))

    expect(root).toContain('--rail-width: clamp(16rem, 38vw, 38rem)')
    expect(root).toContain('--content-max: 112rem')
    expect(root).toContain('--safe-top: env(safe-area-inset-top, 0px)')
    expect(root).toContain('--safe-right: env(safe-area-inset-right, 0px)')
    expect(root).toContain('--safe-bottom: env(safe-area-inset-bottom, 0px)')
    expect(root).toContain('--safe-left: env(safe-area-inset-left, 0px)')
    expect(compactDesktop).toContain(
      'grid-template-columns: 2.3rem minmax(4.5rem, 0.7fr) minmax(0, 1fr) 4.8rem 2rem',
    )
    expect(compactDesktop).not.toContain('--rail-width')
    expect(mobile).toContain('.site-shell { display: block; }')
    expect(mobile).toContain('.article-aside, .article-aside.empty { display: none; }')
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
    const searchScroll = compact(cssBlock('.search-scroll', 1))
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
    const shortDesktop = compact(cssBlock('@media (min-width: 901px) and (max-height: 700px)'))
    const reducedMotion = compact(cssBlock('@media (prefers-reduced-motion: reduce)'))

    expect(shortDesktop).toContain('.category-nav { margin-top: 0.75rem; }')
    expect(shortDesktop).toContain('.rail-block { display: none; }')
    expect(reducedMotion).toContain('animation-duration: 0.01ms !important')
    expect(reducedMotion).toContain('transition-duration: 0.01ms !important')
  })

  it('keeps small metadata and focus indicators above their contrast thresholds', () => {
    const smallTextPairs = [
      ['#8c8c87', '#090909'],
      ['#83837d', '#090909'],
      ['#686863', '#f6f4ee'],
      ['#666660', '#f6f4ee'],
      ['#67566b', '#f6cdff'],
    ] as const
    const focusPairs = [
      ['#dfff4f', '#090909'],
      ['#090909', '#f6f4ee'],
      ['#090909', '#f6cdff'],
    ] as const

    for (const [foreground, background] of smallTextPairs) {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5)
    }
    for (const [foreground, background] of focusPairs) {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(3)
    }

    expect(compact(cssBlock('.category-nav a small'))).toContain('color: #8c8c87')
    expect(compact(cssBlock('.rail-footer'))).toContain('color: #83837d')
    expect(compact(cssBlock('.post-index-number', 1))).toContain('color: #686863')
    expect(compact(cssBlock('.article-aside li a::before'))).toContain('color: #666660')
    expect(compact(cssBlock('.article-footer .eyebrow'))).toContain('color: #67566b')
  })
})
