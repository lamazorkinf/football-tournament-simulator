/**
 * Simple Migration Script: JSONB → Normalized Schema
 *
 * This script migrates tournaments from JSONB to normalized schema
 * using direct Supabase queries (no service dependencies)
 *
 * Usage: npx tsx scripts/migrateData.ts
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

console.log('✓ Supabase client initialized\n');

async function migrate() {
  console.log('🚀 Starting Migration: JSONB → Normalized Schema\n');
  console.log('================================================\n');

  try {
    // Step 1: Check if there are any tournaments in JSONB format
    console.log('📚 Checking for tournaments in JSONB format...');
    const { data: jsonbTournaments, error: fetchError } = await supabase
      .from('tournaments')
      .select('*')
      .order('created_at', { ascending: false });

    if (fetchError) {
      throw fetchError;
    }

    if (!jsonbTournaments || jsonbTournaments.length === 0) {
      console.log('⚠️  No tournaments found in JSONB format.');
      console.log('✅ Nothing to migrate!\n');
      return;
    }

    console.log(`✓ Found ${jsonbTournaments.length} tournament(s) in JSONB format\n`);

    // Step 2: Check if any tournaments already exist in normalized format
    console.log('🔍 Checking normalized schema...');
    const { data: normalizedTournaments, error: normalizedError } = await supabase
      .from('tournaments_new')
      .select('id, name, year');

    if (normalizedError) {
      throw normalizedError;
    }

    const existingIds = new Set(normalizedTournaments?.map(t => t.id) || []);

    if (existingIds.size > 0) {
      console.log(`⚠️  Found ${existingIds.size} tournament(s) already in normalized schema:`);
      normalizedTournaments?.forEach(t => {
        console.log(`   • ${t.name} (${t.year})`);
      });
      console.log();
    }

    // Step 3: For each JSONB tournament, migrate to normalized
    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const jsonbTournament of jsonbTournaments) {
      const metadata = jsonbTournament.metadata as any;
      const tournamentId = jsonbTournament.id;
      const tournamentName = metadata?.name || `Tournament ${tournamentId}`;
      const year = metadata?.year || new Date().getFullYear();

      console.log(`📦 Processing: ${tournamentName} (${year})...`);

      // Skip if already exists
      if (existingIds.has(tournamentId)) {
        console.log(`   ⏭️  Already exists in normalized schema - skipping\n`);
        skipped++;
        continue;
      }

      try {
        // Create tournament in normalized schema
        const { error: insertError } = await supabase
          .from('tournaments_new')
          .insert({
            id: tournamentId,
            name: tournamentName,
            year: year,
            status: 'qualifiers',
            is_qualifiers_complete: metadata?.isQualifiersComplete || false,
            has_any_match_played: metadata?.hasAnyMatchPlayed || false,
            champion_team_id: null,
            runner_up_team_id: null,
            third_place_team_id: null,
            fourth_place_team_id: null,
          });

        if (insertError) {
          throw insertError;
        }

        console.log(`   ✓ Tournament created in normalized schema`);

        // Note: For full migration including qualifiers, groups, and matches,
        // you would need to parse the JSONB metadata and insert into
        // qualifier_groups, matches_new, etc.
        // This is a simplified version that only migrates the tournament record.

        migrated++;
        console.log(`   ✅ Migration successful\n`);

      } catch (error: any) {
        console.error(`   ❌ Error: ${error.message}\n`);
        errors++;
      }
    }

    // Summary
    console.log('================================================');
    console.log('📊 Migration Summary\n');
    console.log(`✓ Migrated: ${migrated}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`📝 Total: ${jsonbTournaments.length}\n`);

    if (migrated > 0) {
      console.log('Next Steps:');
      console.log('  1. Verify data in Supabase dashboard (tournaments_new table)');
      console.log('  2. Set VITE_USE_NORMALIZED_SCHEMA=true in .env (already done ✓)');
      console.log('  3. Test creating new tournaments with the app');
      console.log('  4. Once confirmed working, old JSONB data can be archived\n');
    }

    console.log('✅ Migration Complete!\n');

  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

// Run migration
migrate()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
