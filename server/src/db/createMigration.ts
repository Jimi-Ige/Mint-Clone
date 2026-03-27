import fs from 'fs';
import path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const name = process.argv[2];
if (!name) {
  console.error('Usage: npm run migrate:create -- <migration_name>');
  console.error('Example: npm run migrate:create -- add_notifications_table');
  process.exit(1);
}

// Find next sequence number
const existing = fs.readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort();

const lastNum = existing.length > 0
  ? parseInt(existing[existing.length - 1].split('_')[0])
  : 0;

const seq = String(lastNum + 1).padStart(3, '0');
const filename = `${seq}_${name.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}.sql`;
const filepath = path.join(MIGRATIONS_DIR, filename);

fs.writeFileSync(filepath, `-- Migration: ${name}\n-- Created: ${new Date().toISOString()}\n\n`);

console.log(`Created: server/src/db/migrations/${filename}`);
