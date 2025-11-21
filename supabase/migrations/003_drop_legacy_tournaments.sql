/**
 * Migration: Drop Legacy Tournaments Table
 *
 * This migration removes the old JSONB-based tournaments table
 * now that we've migrated to the normalized schema.
 *
 * IMPORTANT: Only run this after:
 * 1. Migration 002 (normalized schema) has been applied
 * 2. All tournaments have been migrated to tournaments_new
 * 3. VITE_USE_NORMALIZED_SCHEMA=true is active
 * 4. Application has been tested with normalized schema
 */

-- Drop the legacy tournaments table
-- This includes the metadata JSONB column and all associated data
DROP TABLE IF EXISTS tournaments CASCADE;

-- Note: CASCADE will drop any dependent objects (views, triggers, etc.)
-- The normalized schema (tournaments_new) is completely independent
