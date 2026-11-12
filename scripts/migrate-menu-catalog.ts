import { sql, type SQL } from 'drizzle-orm';

import { db } from '../src/db/index.js';

const apply = process.argv.includes('--apply');

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface CatalogCopy {
  catalog: string;
  source: string;
  from: string;
  menuIdColumn: string;
  columns: Record<string, string>;
}

const CATALOG_COPIES: CatalogCopy[] = [
  {
    catalog: 'catalog_section',
    source: 'menu_section',
    from: 'menu_section s',
    menuIdColumn: 's.menu_id',
    columns: {
      parent_catalog_section_id: 's.parent_section_id',
      name: 's.name',
      description: 's.description',
      image: 's.image',
      sort_order: 's.sort_order',
    },
  },
  {
    catalog: 'catalog_item',
    source: 'menu_item',
    from: `menu_item s LEFT JOIN LATERAL (
      SELECT price, price_specification FROM offer
      WHERE offer.menu_item_id = s.id ORDER BY offer.created_at, offer.id LIMIT 1
    ) o ON true`,
    menuIdColumn: 's.menu_id',
    columns: {
      catalog_section_id: 's.menu_section_id',
      name: 's.name',
      description: 's.description',
      image: 's.image',
      suitable_for_diet: 's.suitable_for_diet',
      serving_temperatures: 's.serving_temperatures',
      recommended_serving_temperature_level:
        's.recommended_serving_temperature_level',
      sweetness: 's.sweetness',
      fixed_sweetness_level: 's.fixed_sweetness_level',
      recommended_sweetness_level: 's.recommended_sweetness_level',
      nutrition: 's.nutrition',
      suggested_price: 'o.price',
      price_specification: 'o.price_specification',
      sort_order: 's.sort_order',
    },
  },
  {
    catalog: 'catalog_modifier_group',
    source: 'modifier_group',
    from: 'modifier_group s',
    menuIdColumn: 's.menu_id',
    columns: {
      display_name: 's.display_name',
      min_selection_count: 's.min_selection_count',
      max_selection_count: 's.max_selection_count',
      sort_order: 's.sort_order',
    },
  },
  {
    catalog: 'catalog_modifier',
    source: 'modifier',
    from: 'modifier s JOIN modifier_group g ON g.id = s.modifier_group_id',
    menuIdColumn: 'g.menu_id',
    columns: {
      catalog_modifier_group_id: 's.modifier_group_id',
      display_name: 's.display_name',
      image: 's.image',
      price_adjustment: 's.price_adjustment',
      sort_order: 's.sort_order',
    },
  },
  {
    catalog: 'catalog_item_modifier_group',
    source: 'menu_item_modifier_group',
    from: 'menu_item_modifier_group s JOIN menu_item i ON i.id = s.menu_item_id',
    menuIdColumn: 'i.menu_id',
    columns: {
      catalog_item_id: 's.menu_item_id',
      catalog_modifier_group_id: 's.modifier_group_id',
      sort_order: 's.sort_order',
    },
  },
  {
    catalog: 'catalog_item_add_on',
    source: 'menu_item_add_on',
    from: 'menu_item_add_on s JOIN menu_item i ON i.id = s.menu_item_id',
    menuIdColumn: 'i.menu_id',
    columns: {
      catalog_item_id: 's.menu_item_id',
      add_on_catalog_item_id: 's.add_on_menu_item_id',
      add_on_catalog_section_id: 's.add_on_menu_section_id',
      sort_order: 's.sort_order',
    },
  },
];

const OWNED_CATALOGS = new Set([
  'catalog_section',
  'catalog_item',
  'catalog_modifier_group',
]);

const LINKS: {
  label: string;
  pending: (menuId: string) => SQL;
  write: (menuId: string) => SQL;
}[] = [
  {
    label: 'menu_section.catalog_section_id',
    pending: (menuId) => sql`SELECT count(*)::int AS count FROM menu_section
      WHERE menu_id = ${menuId} AND catalog_section_id IS NULL`,
    write: (menuId) => sql`UPDATE menu_section SET catalog_section_id = id
      WHERE menu_id = ${menuId} AND catalog_section_id IS NULL`,
  },
  {
    label: 'menu_item.catalog_item_id',
    pending: (menuId) => sql`SELECT count(*)::int AS count FROM menu_item
      WHERE menu_id = ${menuId} AND catalog_item_id IS NULL`,
    write: (menuId) => sql`UPDATE menu_item SET catalog_item_id = id
      WHERE menu_id = ${menuId} AND catalog_item_id IS NULL`,
  },
  {
    label: 'modifier.catalog_modifier_id',
    pending: (menuId) => sql`SELECT count(*)::int AS count FROM modifier m
      JOIN modifier_group g ON g.id = m.modifier_group_id
      WHERE g.menu_id = ${menuId} AND m.catalog_modifier_id IS NULL`,
    write: (menuId) => sql`UPDATE modifier m
      SET catalog_modifier_id = m.id, menu_id = coalesce(m.menu_id, g.menu_id)
      FROM modifier_group g
      WHERE g.id = m.modifier_group_id AND g.menu_id = ${menuId}
        AND m.catalog_modifier_id IS NULL`,
  },
  ...['order_item', 'shared_cart_item'].map((table) => ({
    label: `${table}.catalog_item_id`,
    pending: (menuId: string) => sql`SELECT count(*)::int AS count
      FROM ${sql.identifier(table)} t
      JOIN menu_item i ON i.id = t.menu_item_id
      WHERE i.menu_id = ${menuId} AND t.catalog_item_id IS NULL`,
    write: (menuId: string) => sql`UPDATE ${sql.identifier(table)} t
      SET catalog_item_id = i.catalog_item_id
      FROM menu_item i
      WHERE i.id = t.menu_item_id AND i.menu_id = ${menuId}
        AND i.catalog_item_id IS NOT NULL AND t.catalog_item_id IS NULL`,
  })),
];

async function list(query: string) {
  const { rows } = await db.execute<{ id: string }>(sql.raw(query));
  return rows.map((row) => row.id);
}

function printIds(label: string, ids: string[]) {
  if (ids.length > 0) console.log(`${label}: ${ids.join(', ')}`);
}

async function migrateStore(
  tx: Tx,
  menuId: string,
  ownerOrganizationId: string | null,
) {
  for (const copy of CATALOG_COPIES) {
    const where = sql`${sql.raw(copy.menuIdColumn)} = ${menuId}`;
    const { rows } = await tx.execute<{ action: string; ids: string[] }>(sql`
      SELECT CASE
          WHEN c.id IS NULL THEN 'insert'
          WHEN s.updated_at > c.updated_at THEN 'overwrite'
          WHEN s.updated_at < c.updated_at THEN 'catalogNewer'
          ELSE 'unchanged'
        END AS action, array_agg(s.id ORDER BY s.id) AS ids
      FROM ${sql.raw(copy.from)}
      LEFT JOIN ${sql.raw(copy.catalog)} c ON c.id = s.id
      WHERE ${where}
      GROUP BY 1`);
    const ids = Object.fromEntries(rows.map((row) => [row.action, row.ids]));
    const counts = ['insert', 'overwrite', 'unchanged', 'catalogNewer']
      .map((action) => `${action} ${ids[action]?.length ?? 0}`)
      .join(', ');
    console.log(`  ${copy.catalog}: ${counts}`);
    printIds(
      `  ${copy.catalog} newer than ${copy.source}, skipped`,
      ids.catalogNewer ?? [],
    );
    if (!apply || (!ids.insert && !ids.overwrite)) continue;

    const owned = OWNED_CATALOGS.has(copy.catalog);
    const columns = Object.keys(copy.columns);
    const insertColumns = [
      'id',
      ...(owned ? ['owner_organization_id'] : []),
      ...columns,
      'created_at',
      'updated_at',
    ];
    const updates = [...columns, 'created_at', 'updated_at']
      .map((column) => `${column} = excluded.${column}`)
      .join(', ');
    await tx.execute(sql`
      INSERT INTO ${sql.raw(copy.catalog)} (${sql.raw(insertColumns.join(', '))})
      SELECT s.id, ${owned ? sql`${ownerOrganizationId}::text,` : sql``}
        ${sql.raw(Object.values(copy.columns).join(', '))},
        s.created_at, s.updated_at
      FROM ${sql.raw(copy.from)}
      WHERE ${where}
      ON CONFLICT (id) DO UPDATE SET ${sql.raw(updates)}
      WHERE ${sql.raw(copy.catalog)}.updated_at < excluded.updated_at`);
  }

  for (const link of LINKS) {
    if (apply) {
      const { rowCount } = await tx.execute(link.write(menuId));
      console.log(`  ${link.label}: wrote ${rowCount ?? 0}`);
    } else {
      const { rows } = await tx.execute<{ count: number }>(
        link.pending(menuId),
      );
      console.log(`  ${link.label}: would write ${rows[0].count}`);
    }
  }
}

async function main() {
  const { rows: nameColumn } = await db.execute<{ is_nullable: string }>(sql`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'menu_item' AND column_name = 'name'`);
  if (nameColumn[0]?.is_nullable !== 'NO') {
    throw new Error(
      'Refusing to migrate: menu_item.name is nullable, so the old menu tables are no longer a reliable source.',
    );
  }

  const { rows: stores } = await db.execute<{
    menuId: string;
    organizationId: string;
    slug: string;
  }>(sql`
    SELECT m.id AS "menuId", m.organization_id AS "organizationId", o.slug
    FROM menu m JOIN organization o ON o.id = m.organization_id
    WHERE EXISTS (SELECT 1 FROM menu_section WHERE menu_id = m.id)
       OR EXISTS (SELECT 1 FROM menu_item WHERE menu_id = m.id)
    ORDER BY m.created_at, m.id`);
  const brand = stores.length === 1;
  console.log(
    `${stores.length} stores with menu content: ${brand ? 'brand items' : 'store-exclusive items'}`,
  );

  for (const store of stores) {
    console.log(`${store.slug} (${store.organizationId}):`);
    await db.transaction((tx) =>
      migrateStore(tx, store.menuId, brand ? null : store.organizationId),
    );
  }

  if (!apply) {
    for (const copy of CATALOG_COPIES) {
      printIds(
        `${copy.catalog} without a ${copy.source} row`,
        await list(
          `SELECT id FROM ${copy.catalog} c WHERE NOT EXISTS (SELECT 1 FROM ${copy.source} s WHERE s.id = c.id) ORDER BY id`,
        ),
      );
    }
    printIds(
      'menu_item with more than one offer',
      await list(
        'SELECT menu_item_id AS id FROM offer WHERE menu_item_id IS NOT NULL GROUP BY menu_item_id HAVING count(*) > 1 ORDER BY 1',
      ),
    );
    printIds(
      'offer with menu_section_id',
      await list(
        'SELECT id FROM offer WHERE menu_section_id IS NOT NULL ORDER BY id',
      ),
    );
  }

  console.log(apply ? 'Done.' : 'Dry run; pass --apply to migrate.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
