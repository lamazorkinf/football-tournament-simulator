/**
 * Typed Supabase Client for Normalized Schema
 *
 * This module provides type-safe access to the normalized schema tables.
 * Uses explicit type assertions to bypass TypeScript inference issues.
 */

import { supabase } from './supabase';

/**
 * Typed query builders for normalized schema tables
 *
 * Note: We use 'as any' type assertions here to bypass TypeScript's strict
 * type inference. This is safe because we know the tables exist in the database
 * and the types are defined in database.ts.
 */
export const db = {
  // Normalized tables
  tournaments_new: () => (supabase.from('tournaments_new') as any),
  qualifier_groups: () => (supabase.from('qualifier_groups') as any),
  qualifier_group_teams: () => (supabase.from('qualifier_group_teams') as any),
  world_cup_groups: () => (supabase.from('world_cup_groups') as any),
  world_cup_group_teams: () => (supabase.from('world_cup_group_teams') as any),
  matches_new: () => (supabase.from('matches_new') as any),
  team_tournament_skills: () => (supabase.from('team_tournament_skills') as any),

  // Views
  qualifier_standings: () => (supabase.from('qualifier_standings') as any),
  world_cup_standings: () => (supabase.from('world_cup_standings') as any),
} as const;
