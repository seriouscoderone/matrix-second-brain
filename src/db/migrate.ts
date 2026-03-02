import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import * as path from 'path';
import * as schema from './schema';
import { env } from '../config';

let db: ReturnType<typeof createDb>;

export function createDb() {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  return drizzle(pool, { schema });
}

export async function runMigrations() {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  // Use process.cwd() so the .sql files are found whether running from
  // dist/ (compiled) or src/ (ts-node). tsc does not copy non-TS files.
  await migrate(db, {
    migrationsFolder: path.join(process.cwd(), 'src', 'db', 'migrations'),
  });

  await pool.end();
  console.log('Migrations complete');
}

export function getDb() {
  if (!db) {
    db = createDb();
  }
  return db;
}

export type Db = ReturnType<typeof createDb>;
