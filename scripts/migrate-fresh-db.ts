import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';

async function main() {
  if (!process.env.DATABASE_URL)
    throw new Error('Missing environment variable: DATABASE_URL');

  // 必須動態載入：靜態 import 會先讓 dotenv 讀進 .env 的 DATABASE_URL，上面的檢查就形同虛設
  const { db } = await import('../src/db/index.js');

  try {
    const { rows } = await db.execute<{ count: number }>(
      sql`SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema IN ('public', 'drizzle')`,
    );
    if (rows[0].count)
      throw new Error(
        'Refusing to migrate: the database already has tables. migrate-fresh-db only runs on an empty database; use drizzle-kit migrate otherwise.',
      );

    await db.execute(sql`CREATE SCHEMA drizzle`);
    await db.execute(
      sql`CREATE TABLE drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
    );

    const migrations = readMigrationFiles({ migrationsFolder: 'drizzle' });
    for (const migration of migrations)
      await db.transaction(async (tx) => {
        for (const statement of migration.sql)
          await tx.execute(sql.raw(statement));
        await tx.execute(
          sql`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES (${migration.hash}, ${migration.folderMillis})`,
        );
      });

    console.log(`Applied ${migrations.length} migrations`);
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
