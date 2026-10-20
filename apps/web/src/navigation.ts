export function collectionUrl(pathname: string, view: string | null, category?: string): string {
  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (view === 'list' || view === 'tiles') params.set('view', view)
  const query = params.toString()
  const reading = pathname === '/notes' || pathname.startsWith('/posts/')
  return `${reading ? '/notes' : '/'}${query ? `?${query}` : ''}${!reading && !category ? '#post-index' : ''}`
}
