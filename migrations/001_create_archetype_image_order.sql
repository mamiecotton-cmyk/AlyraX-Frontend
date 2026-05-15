-- Migration: create archetype_image_order table
-- Run this in your Supabase (Postgres) database.

CREATE TABLE IF NOT EXISTS archetype_image_order (
  archetype_id text PRIMARY KEY,
  ordering jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Optional index if you plan to query ordering contents
CREATE INDEX IF NOT EXISTS idx_archetype_image_order_archetype_id ON archetype_image_order(archetype_id);
