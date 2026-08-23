CREATE TABLE IF NOT EXISTS posts (
  id text PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  source_path text NOT NULL UNIQUE,
  source_path_nfc text NOT NULL UNIQUE,
  source_hash text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  excerpt text NOT NULL DEFAULT '',
  category text NOT NULL,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  content_format text NOT NULL CHECK (content_format IN ('markdown', 'html', 'text')),
  content_raw text NOT NULL,
  content_html text NOT NULL,
  reading_minutes integer NOT NULL CHECK (reading_minutes > 0),
  status text NOT NULL DEFAULT 'review'
    CHECK (status IN ('draft', 'review', 'published', 'quarantined')),
  review_reasons text[] NOT NULL DEFAULT ARRAY[]::text[],
  published_at timestamptz,
  source_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS posts_published_at_idx
  ON posts (status, published_at DESC);

CREATE INDEX IF NOT EXISTS posts_category_idx
  ON posts (category, published_at DESC);

CREATE INDEX IF NOT EXISTS posts_tags_idx
  ON posts USING gin (tags);
