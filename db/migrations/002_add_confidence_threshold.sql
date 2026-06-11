-- Add confidence_threshold to monitors for sensitivity control
ALTER TABLE monitors ADD COLUMN IF NOT EXISTS confidence_threshold INTEGER NOT NULL DEFAULT 50;
