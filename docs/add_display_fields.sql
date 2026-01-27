-- Migration: Add display_title and display_message columns to qr_refs
-- These columns allow customizing the text shown on the QR card
-- (separate from the internal name/description fields)

ALTER TABLE qr_refs 
ADD COLUMN IF NOT EXISTS display_title VARCHAR(100),
ADD COLUMN IF NOT EXISTS display_message TEXT;

-- Add comment for documentation
COMMENT ON COLUMN qr_refs.display_title IS 'Custom title shown on QR card (defaults to name if empty)';
COMMENT ON COLUMN qr_refs.display_message IS 'Custom message shown below QR code (e.g., "Scan to connect!")';
