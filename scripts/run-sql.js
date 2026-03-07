#!/usr/bin/env node
/**
 * Run a SQL file against Supabase.
 * Uses DATABASE_URL from env or .env.local, or local default if unset.
 *
 * Usage: node scripts/run-sql.js <path-to.sql>
 * Example: node scripts/run-sql.js supabase/scripts/add_income_source_if_missing.sql
 */

const fs = require('fs');
const path = require('path');

// Load .env.local if present (for DATABASE_URL)
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}

const { Pool } = require('pg');

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error('Usage: node scripts/run-sql.js <path-to.sql>');
  process.exit(1);
}

const resolvedPath = path.resolve(process.cwd(), sqlPath);
if (!fs.existsSync(resolvedPath)) {
  console.error('File not found:', resolvedPath);
  process.exit(1);
}

const sql = fs.readFileSync(resolvedPath, 'utf8');
const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const pool = new Pool({ connectionString: dbUrl });

pool.query(sql)
  .then(() => {
    console.log('SQL executed successfully:', sqlPath);
    pool.end();
  })
  .catch((err) => {
    console.error('SQL execution failed:', err.message);
    if (err.message.includes('ECONNREFUSED') && !process.env.DATABASE_URL) {
      console.error('\nNo DATABASE_URL set. For remote Supabase: add to .env.local');
      console.error('  DATABASE_URL=postgresql://postgres.[ref]:[password]@...[from Dashboard → Settings → Database]');
      console.error('For local: run "supabase start" then run this again.');
    }
    pool.end();
    process.exit(1);
  });
