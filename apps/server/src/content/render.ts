import { load } from 'cheerio'
import hljs from 'highlight.js/lib/common'
import { Marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import sanitizeHtml from 'sanitize-html'
import type { ContentFormat } from '../types.js'

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const markdown = new Marked(
  markedHighlight({
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code, language) {
      // Unlabelled/unknown fences are plain text. Auto-detection tries every grammar
      // and can monopolize the API process while an author types a preview.
      // Bound work for large pasted files even when a language is supplied.
      if (code.length <= 16_384 && language && hljs.getLanguage(language)) {
        return hljs.highlight(code, { language }).value
      }
      return escapeHtml(code)
    },
  }),
  {
    gfm: true,
    breaks: false,
    renderer: {
      html({ text }) {
        return /^<br\s*\/?\s*>$/i.test(text.trim()) ? '<br>' : escapeHtml(text)
      },
    },
  },
)

const allowedTags = [
  ...sanitizeHtml.defaults.allowedTags,
  'article',
  'section',
  'figure',
  'figcaption',
  'details',
  'summary',
  'mark',
  'kbd',
  'samp',
  'sub',
  'sup',
]

function slugifyHeading(value: string): string {
  const slug = value
    .normalize('NFC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug || 'section'
}

function extractHtmlBody(input: string): string {
  const $ = load(input)
  $('script, style, noscript, iframe, object, embed, form, meta, link').remove()
  const body = $('body')
  return body.length > 0 ? body.html() || '' : $.root().html() || ''
}

function plainTextToHtml(input: string): string {
  const escaped = escapeHtml(input)
  return escaped
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('\n')
}

function sanitize(input: string): string {
  return sanitizeHtml(input, {
    allowedTags,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      code: ['class'],
      pre: ['class'],
      div: ['class'],
      span: ['class'],
      h1: ['id'],
      h2: ['id'],
      h3: ['id'],
      h4: ['id'],
      h5: ['id'],
      h6: ['id'],
      th: ['colspan', 'rowspan', 'scope'],
      td: ['colspan', 'rowspan'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['http', 'https'],
    },
    allowProtocolRelative: false,
    enforceHtmlBoundary: true,
    transformTags: {
      a: (_tagName, attributes) => {
        const isExternal = /^https?:\/\//i.test(attributes.href || '')
        return {
          tagName: 'a',
          attribs: {
            ...attributes,
            ...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
          },
        }
      },
      img: (_tagName, attributes) => ({
        tagName: 'img',
        attribs: { ...attributes, loading: 'lazy' },
      }),
    },
  })
}

function addHeadingIds(input: string): string {
  const $ = load(input, null, false)
  const occurrences = new Map<string, number>()
  const usedIds = new Set<string>()

  $('h1, h2, h3, h4, h5, h6').each((_index, element) => {
    const heading = $(element)
    const base = slugifyHeading(heading.text())
    let count = (occurrences.get(base) ?? 0) + 1
    let id = count === 1 ? base : `${base}-${count}`
    while (usedIds.has(id)) {
      count += 1
      id = `${base}-${count}`
    }
    occurrences.set(base, count)
    usedIds.add(id)
    heading.attr('id', id)
  })

  return $.html()
}

export function renderContent(input: string, format: ContentFormat): string {
  const rendered =
    format === 'markdown'
      ? String(markdown.parse(input))
      : format === 'html'
        ? extractHtmlBody(input)
        : plainTextToHtml(input)

  return addHeadingIds(sanitize(rendered))
}

export function stripMarkup(input: string): string {
  const $ = load(input)
  $('script, style, noscript').remove()
  return $.root().text().replace(/\s+/g, ' ').trim()
}
