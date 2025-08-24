-- Migration: Rename billing.plans.tier -> model_tier (canonical naming)
-- Created: 2025-08-21
-- Rationale: Align column name with generated types and RPC expectations, removing ambiguity.

BEGIN;

-- Only rename if old column exists and new does not (idempotent safety)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
     WHERE table_schema = 'billing' AND table_name = 'plans' AND column_name = 'tier'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
     WHERE table_schema = 'billing' AND table_name = 'plans' AND column_name = 'model_tier'
  ) THEN
    ALTER TABLE billing.plans RENAME COLUMN tier TO model_tier;
  END IF;
END$$;

COMMIT;
