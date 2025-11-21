/**
 * Script to apply the normalized schema migration to Supabase
 * Run with: node supabase/apply-normalized-migration.js
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Error: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env file');
  process.exit(1);
}

console.log('🔗 Connecting to Supabase...');
console.log(`   URL: ${SUPABASE_URL}`);

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function applyMigration() {
  try {
    console.log('\n📖 Reading migration file...');
    const migrationPath = join(__dirname, 'migrations', '002_normalized_schema.sql');
    const sql = readFileSync(migrationPath, 'utf8');

    console.log('✅ Migration file loaded');
    console.log(`   Size: ${(sql.length / 1024).toFixed(2)} KB`);
    console.log(`   Lines: ${sql.split('\n').length}`);

    console.log('\n🚀 Applying migration...');
    console.log('   This may take a few seconds...\n');

    // Split by statement (simple approach - split by semicolon outside of functions)
    // For complex migrations, consider using a proper SQL parser
    const statements = sql
      .split(/;(?=\s*(?:CREATE|DROP|ALTER|INSERT|COMMENT|DO)\s)/gi)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`   Found ${statements.length} SQL statements to execute\n`);

    let executed = 0;
    let errors = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      const preview = statement.substring(0, 80).replace(/\s+/g, ' ');

      try {
        process.stdout.write(`   [${i + 1}/${statements.length}] ${preview}...`);

        const { error } = await supabase.rpc('exec_sql', { sql_query: statement });

        if (error) {
          console.log(' ❌');
          console.error(`      Error: ${error.message}`);
          errors++;
        } else {
          console.log(' ✅');
          executed++;
        }
      } catch (err) {
        console.log(' ❌');
        console.error(`      Exception: ${err.message}`);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Migration completed!`);
    console.log(`   Executed: ${executed}/${statements.length}`);
    if (errors > 0) {
      console.log(`   ⚠️  Errors: ${errors}`);
      console.log('\n⚠️  Some statements failed. This might be normal if:');
      console.log('   - Objects already exist (DROP IF EXISTS will handle this)');
      console.log('   - You are using Supabase hosted (some SQL features are restricted)');
      console.log('\n💡 For hosted Supabase, use the SQL Editor in the dashboard instead:');
      console.log('   1. Go to https://supabase.com/dashboard');
      console.log('   2. Navigate to SQL Editor');
      console.log('   3. Copy the contents of supabase/migrations/002_normalized_schema.sql');
      console.log('   4. Paste and run in the SQL Editor');
    }
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
applyMigration();
