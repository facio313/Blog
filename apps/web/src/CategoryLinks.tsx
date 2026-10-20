import { motion, useReducedMotion } from 'framer-motion'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { motionEase } from './motion'
import { collectionUrl } from './navigation'
import type { MetaResponse } from './types'

const MotionLink = motion.create(Link)

const variantClassNames = {
  index: 'category-nav index-category-nav',
  reading: 'category-nav article-category-nav',
  menu: 'mobile-category-nav',
} as const

interface CategoryLinksProps {
  categories: MetaResponse['categories']
  activeCategory?: string | undefined
  variant: keyof typeof variantClassNames
  headingId?: string
  onSelect?: (() => void) | undefined
}

export function CategoryLinks({
  categories,
  activeCategory,
  variant,
  headingId,
  onSelect,
}: CategoryLinksProps) {
  const [searchParams] = useSearchParams()
  const { pathname } = useLocation()
  const reduceMotion = useReducedMotion()
  const requestedView = searchParams.get('view')
  const promoteActive = variant !== 'menu'
  const activeStyle = promoteActive
    ? { gridColumn: `1 / span ${Math.max(1, categories.length)}` }
    : {}
  const transition = { layout: { duration: reduceMotion ? 0 : 0.55, ease: motionEase } }
  const items = [
    {
      key: 'all',
      label: 'All notes',
      count: undefined,
      active: !activeCategory,
      to: {
        pathname: '/',
        search:
          requestedView === 'list' || requestedView === 'tiles' ? `?view=${requestedView}` : '',
      },
    },
    ...categories.map((category) => ({
      key: `category:${category.name}`,
      label: category.name,
      count: category.count,
      active: activeCategory === category.name,
      to: collectionUrl(pathname, requestedView, category.name),
    })),
  ]

  return (
    <motion.nav
      className={variantClassNames[variant]}
      aria-label="카테고리"
      layoutScroll={promoteActive}
    >
      {promoteActive ? (
        <motion.h2
          id={!activeCategory ? headingId : undefined}
          className="category-collection-title"
          aria-label="collection."
          aria-hidden={Boolean(activeCategory)}
          initial={false}
          animate={{ opacity: activeCategory ? 0 : 1, x: activeCategory ? -24 : 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.35, ease: motionEase }}
          style={activeStyle}
        >
          collection<span className="accent">.</span>
        </motion.h2>
      ) : null}
      {items.map((item) => (
        <MotionLink
          key={item.key}
          className={
            item.active
              ? `is-active${promoteActive && item.key !== 'all' ? ' is-promoted' : ''}`
              : ''
          }
          layout={promoteActive && !reduceMotion ? 'position' : false}
          transition={transition}
          style={item.active && item.key !== 'all' ? activeStyle : {}}
          to={item.to}
          state={{ preserveScroll: true }}
          preventScrollReset
          aria-current={item.active ? 'page' : undefined}
          onClick={onSelect}
        >
          <motion.span
            layout={promoteActive && !reduceMotion}
            transition={transition}
            style={{ originX: 0, originY: 0 }}
            id={item.active && item.key !== 'all' ? headingId : undefined}
            role={item.active && headingId && item.key !== 'all' ? 'heading' : undefined}
            aria-level={item.active && headingId && item.key !== 'all' ? 2 : undefined}
          >
            {item.label}
          </motion.span>
          {item.count !== undefined ? (
            <motion.small
              layout={promoteActive && !reduceMotion ? 'position' : false}
              transition={transition}
            >
              {String(item.count).padStart(2, '0')}
            </motion.small>
          ) : null}
        </MotionLink>
      ))}
    </motion.nav>
  )
}
