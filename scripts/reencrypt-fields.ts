import {
  and,
  DrizzleQueryError,
  eq,
  getTableName,
  isNotNull,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

import {
  decryptField,
  encryptField,
  fieldEncryptionKeys,
  fieldEncryptionVersion,
  type FieldEncryptionPurpose,
} from '../src/common/utils/field-encryption.js';
import { db } from '../src/db/index.js';
import {
  payrollTaxIdentity,
  quantAiKey,
  quantCredential,
} from '../src/db/schema/index.js';
import { quantEnvironment } from '../src/quant/quant-environment.js';

type EncryptedField = {
  table: PgTable;
  id: PgColumn;
  column: PgColumn;
  purpose: FieldEncryptionPurpose;
  scope?: SQL;
};

const apply = process.argv.includes('--apply');

const encryptedFields = (environment: string): EncryptedField[] => [
  ...[
    payrollTaxIdentity.encryptedTaxId,
    payrollTaxIdentity.encryptedAddress,
    payrollTaxIdentity.encryptedForeignTaxId,
  ].map((column) => ({
    table: payrollTaxIdentity,
    id: payrollTaxIdentity.employeeId,
    column,
    purpose: 'payroll' as const,
  })),
  ...[quantCredential.encryptedApiKey, quantCredential.encryptedApiSecret].map(
    (column) => ({
      table: quantCredential,
      id: quantCredential.id,
      column,
      purpose: 'quantCredential' as const,
      scope: eq(quantCredential.environment, environment),
    }),
  ),
  {
    table: quantAiKey,
    id: quantAiKey.id,
    column: quantAiKey.encryptedApiKey,
    purpose: 'quantAiKey',
    scope: eq(quantAiKey.environment, environment),
  },
];

async function main() {
  const [current] = fieldEncryptionKeys() ?? [];
  if (!current?.[1])
    throw new Error(
      'FIELD_ENCRYPTION_KEYS must start with a v<number> key to re-encrypt to',
    );
  const [currentVersion] = current;

  let failed = 0;
  for (const { table, id, column, purpose, scope } of encryptedFields(
    quantEnvironment(),
  )) {
    const name = `${getTableName(table)}.${column.name}`;
    const rows = await db
      .select({ id: sql<string>`${id}`, value: sql<string>`${column}` })
      .from(table)
      .where(and(isNotNull(column), scope));

    let onCurrent = 0;
    const toReencrypt = new Map<string, number>();
    const failedIds: string[] = [];
    let reencrypted = 0;
    let skipped = 0;
    for (const row of rows) {
      const version = fieldEncryptionVersion(row.value);
      if (version === currentVersion) {
        onCurrent++;
        continue;
      }
      let plaintext: string;
      try {
        plaintext = decryptField(row.value, purpose);
      } catch {
        failedIds.push(row.id);
        continue;
      }
      toReencrypt.set(version, (toReencrypt.get(version) ?? 0) + 1);
      if (!apply) continue;

      const { rowCount } = await db.execute(
        sql`UPDATE ${table} SET ${sql.identifier(column.name)} = ${encryptField(plaintext, purpose)} WHERE ${id} = ${row.id} AND ${column} = ${row.value}`,
      );
      if (rowCount) reencrypted++;
      else skipped++;
    }

    const pending =
      [...toReencrypt].map(([v, count]) => `${v} ${count}`).join(', ') || '0';
    console.log(
      `${name}: ${onCurrent} on ${currentVersion}, to re-encrypt ${pending}, ${failedIds.length} failed to decrypt`,
    );
    if (failedIds.length)
      console.log(`${name}: failed rows ${failedIds.join(', ')}`);
    if (apply)
      console.log(`${name}: re-encrypted ${reencrypted}, skipped ${skipped}`);
    failed += failedIds.length;
  }

  console.log(apply ? 'Done.' : 'Dry run; pass --apply to re-encrypt them.');
  if (failed) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    // drizzle 的查詢錯誤帶著參數，也就是密文
    console.error(error instanceof DrizzleQueryError ? error.cause : error);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
