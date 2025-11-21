/**
 * Script to check if matchday column exists and provide SQL to add it
 * Run with: node scripts/apply-matchday-migration.cjs
 */

require('dotenv').config();

console.log('');
console.log('════════════════════════════════════════════════════════════');
console.log('  MATCHDAY COLUMN MIGRATION');
console.log('════════════════════════════════════════════════════════════');
console.log('');
console.log('⚠️  This migration needs to be applied manually in Supabase.');
console.log('');
console.log('📋 Steps to apply:');
console.log('   1. Go to your Supabase project dashboard');
console.log('   2. Navigate to: SQL Editor');
console.log('   3. Run the following SQL:');
console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('');
console.log('ALTER TABLE matches_new');
console.log('ADD COLUMN IF NOT EXISTS matchday INTEGER CHECK (matchday > 0);');
console.log('');
console.log('COMMENT ON COLUMN matches_new.matchday IS \'Matchday/round number for fixture ordering (1-20 for qualifiers, 1-3 for World Cup)\';');
console.log('');
console.log('────────────────────────────────────────────────────────────');
console.log('');
console.log('✅ After running the SQL above, the migration will be complete.');
console.log('');
console.log('════════════════════════════════════════════════════════════');
console.log('');
