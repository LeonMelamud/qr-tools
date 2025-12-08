-- Add won column to participants table
-- Run this in Supabase SQL Editor

ALTER TABLE participants ADD COLUMN won BOOLEAN DEFAULT false;

-- Optional: Create index for faster filtering
CREATE INDEX idx_participants_won ON participants(won);
