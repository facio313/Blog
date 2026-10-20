import { JSON_SCHEMA, dump, load } from 'js-yaml'
import { z } from 'zod'

export const markdownByteLimit = 512 * 1024

export const markdownBodySchema = z
  .string()
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= markdownByteLimit,
    'Markdown exceeds 512 KiB',
  )

export const authorFieldsSchema = z.object({
  title: z.string().trim().max(200),
  description: z.string().max(1000),
  category: z.string().trim().max(80),
  tags: z.array(z.string().trim().min(1).max(60)).max(30),
  contentRaw: markdownBodySchema,
})

export type AuthorFields = z.infer<typeof authorFieldsSchema>

export class MarkdownFileError extends Error {}

function stringField(value: unknown, field: string): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new MarkdownFileError(`invalid_${field}`)
  return value
}

function stringList(value: unknown, field: string): string[] {
  if (value === undefined || value === null) return []
  const items = Array.isArray(value) ? value : [value]
  if (!items.every((item): item is string => typeof item === 'string')) {
    throw new MarkdownFileError(`invalid_${field}`)
  }
  return items.map((item) => item.trim()).filter(Boolean)
}

export function importMarkdown(filename: string, markdown: string): AuthorFields {
  if (!/\.md$/i.test(filename) || /[/\\\0]/.test(filename)) {
    throw new MarkdownFileError('invalid_markdown_filename')
  }
  const source = markdown.replace(/^\uFEFF/, '')
  let contentRaw = source
  let metadata: Record<string, unknown> = {}

  if (/^---\r?\n/.test(source)) {
    const block = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/)
    if (!block) throw new MarkdownFileError('invalid_frontmatter')
    try {
      const value: unknown = load(block[1] ?? '', { schema: JSON_SCHEMA })
      if (
        value !== undefined &&
        (typeof value !== 'object' || value === null || Array.isArray(value))
      ) {
        throw new MarkdownFileError('invalid_frontmatter')
      }
      metadata = (value ?? {}) as Record<string, unknown>
    } catch {
      // Do not return YAML exception excerpts: a file can contain private draft text.
      throw new MarkdownFileError('invalid_frontmatter')
    }
    contentRaw = block[2] ?? ''
  }

  const fields = authorFieldsSchema.safeParse({
    title:
      stringField(metadata.title, 'title') ||
      contentRaw.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
      filename.replace(/\.md$/i, ''),
    description: stringField(metadata.description, 'description'),
    category:
      stringField(metadata.category, 'category') ||
      stringList(metadata.categories, 'categories')[0] ||
      'Notes',
    tags: stringList(metadata.tags, 'tags'),
    contentRaw,
  })
  if (!fields.success) throw new MarkdownFileError('invalid_markdown_metadata')
  // A file's published/date/slug fields never authorize a publication or replace an existing URL.
  return fields.data
}

export function exportMarkdown(fields: AuthorFields): { filename: string; markdown: string } {
  const filename =
    fields.title
      .normalize('NFC')
      .replace(/[/\\:*?"<>|\p{Control}]/gu, '-')
      .replace(/^\.+/, '')
      .trim()
      .slice(0, 100) || 'untitled'
  const metadata = dump(
    {
      title: fields.title,
      description: fields.description,
      categories: fields.category ? [fields.category] : [],
      tags: fields.tags,
      published: false,
    },
    { schema: JSON_SCHEMA, noRefs: true, lineWidth: -1, quoteStyle: 'double', forceQuotes: true },
  )
  return { filename: `${filename}.md`, markdown: `---\n${metadata}---\n${fields.contentRaw}` }
}
