ALTER TABLE posts
  ADD COLUMN editor_managed boolean NOT NULL DEFAULT false,
  ADD COLUMN editor_user text,
  ADD COLUMN edit_version integer NOT NULL DEFAULT 1 CHECK (edit_version > 0);

-- A saved edit must not replace a published article until the author publishes it.
CREATE TABLE post_drafts (
  post_id text PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  content_raw text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
