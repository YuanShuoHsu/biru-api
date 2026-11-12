import { randomUUID } from 'node:crypto';

import { hashPassword } from 'better-auth/crypto';

import { statutoryLeaveTypeSeeds } from '../src/attendance/statutory-leave-types.js';
import * as schema from '../src/db/schema/index.js';

const ACCOUNTS = {
  PLATFORM_ADMIN: { role: 'admin', memberRole: null },
  OWNER: { role: 'user', memberRole: 'owner' },
  ADMIN: { role: 'user', memberRole: 'admin' },
  MEMBER: { role: 'user', memberRole: 'member' },
  CUSTOMER: { role: 'user', memberRole: null },
} as const satisfies Record<
  string,
  { role: schema.UserRole; memberRole: schema.MemberRole | null }
>;

const requiredEnv = [
  'DATABASE_URL',
  ...Object.keys(ACCOUNTS).flatMap((key) => [
    `E2E_${key}_EMAIL`,
    `E2E_${key}_PASSWORD`,
  ]),
];

const localized = (name: string) =>
  Object.fromEntries(
    schema.languagesEnum.enumValues.map((language) => [language, name]),
  );

async function main() {
  const missing = requiredEnv.filter((name) => !process.env[name]);
  if (missing.length)
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);

  // 必須動態載入：靜態 import 會先讓 dotenv 讀進 .env 的 DATABASE_URL，上面的檢查就形同虛設
  const { db } = await import('../src/db/index.js');

  try {
    await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: schema.organization.id })
        .from(schema.organization)
        .limit(1);
      if (existing.length)
        throw new Error(
          'Refusing to seed: the database already has an organization. seed-e2e only runs on an empty database.',
        );

      const now = new Date();
      const organizationId = randomUUID();
      await tx.insert(schema.organization).values({
        id: organizationId,
        name: 'E2E Store',
        slug: 'e2e-store',
        createdAt: now,
        addressCountry: 'TW',
        addressRegion: '臺北市',
        addressLocality: '中正區',
        streetAddress: '重慶南路一段 122 號',
        openingHours: 'Mo-Su 00:00-00:00',
      });
      await tx
        .insert(schema.attendanceLeaveType)
        .values(statutoryLeaveTypeSeeds(organizationId));

      for (const [key, { role, memberRole }] of Object.entries(ACCOUNTS)) {
        const userId = randomUUID();
        const lastName = key.toLowerCase().replace('_', ' ');
        await tx.insert(schema.user).values({
          id: userId,
          name: `E2E ${lastName}`,
          email: process.env[`E2E_${key}_EMAIL`]!.toLowerCase(),
          emailVerified: true,
          role,
          firstName: 'E2E',
          lastName,
        });
        await tx.insert(schema.account).values({
          id: randomUUID(),
          accountId: userId,
          providerId: 'credential',
          userId,
          password: await hashPassword(process.env[`E2E_${key}_PASSWORD`]!),
        });
        if (memberRole)
          await tx.insert(schema.member).values({
            id: randomUUID(),
            organizationId,
            userId,
            role: memberRole,
            createdAt: now,
          });
      }

      const menuId = randomUUID();
      await tx.insert(schema.menu).values({
        id: menuId,
        organizationId,
        name: localized('E2E Store'),
      });

      const sectionId = randomUUID();
      await tx.insert(schema.menuSection).values({
        id: sectionId,
        menuId,
        name: localized('Coffee'),
      });

      const items = [
        { name: 'Latte', price: '120' },
        { name: 'Americano', price: '90' },
        { name: 'Cookie', price: '50' },
      ].map((item, sortOrder) => ({ ...item, id: randomUUID(), sortOrder }));
      await tx.insert(schema.menuItem).values(
        items.map(({ id, name, sortOrder }) => ({
          id,
          menuId,
          menuSectionId: sectionId,
          name: localized(name),
          sortOrder,
        })),
      );
      await tx.insert(schema.offer).values(
        items.map(({ id, price }) => ({
          id: randomUUID(),
          menuItemId: id,
          price,
        })),
      );
      const [latte, americano, cookie] = items;

      await tx.insert(schema.menuItemAddOn).values({
        id: randomUUID(),
        menuItemId: latte.id,
        addOnMenuItemId: cookie.id,
      });

      const modifierGroupId = randomUUID();
      await tx.insert(schema.modifierGroup).values({
        id: modifierGroupId,
        menuId,
        displayName: localized('Milk'),
        minSelectionCount: 1,
        maxSelectionCount: 1,
      });
      await tx.insert(schema.modifier).values([
        {
          id: randomUUID(),
          modifierGroupId,
          displayName: localized('Whole milk'),
          priceAdjustment: '0',
          sortOrder: 0,
        },
        {
          id: randomUUID(),
          modifierGroupId,
          displayName: localized('Oat milk'),
          priceAdjustment: '15',
          sortOrder: 1,
        },
      ]);
      await tx.insert(schema.menuItemModifierGroup).values(
        [latte, americano].map(({ id }) => ({
          id: randomUUID(),
          menuItemId: id,
          modifierGroupId,
        })),
      );

      const OPENING_STOCK = '10000';
      const ingredients = await tx
        .insert(schema.ingredient)
        .values(
          [
            { name: 'Espresso beans', unitCode: 'GRM' as const },
            { name: 'Whole milk', unitCode: 'MLT' as const },
            { name: 'Oat milk', unitCode: 'MLT' as const },
          ].map(({ name, unitCode }, sortOrder) => ({
            id: randomUUID(),
            organizationId,
            name: localized(name),
            unitCode,
            inventoryLevel: OPENING_STOCK,
            sortOrder,
          })),
        )
        .returning({ id: schema.ingredient.id });
      await tx.insert(schema.inventoryTransaction).values(
        ingredients.map(({ id }) => ({
          id: randomUUID(),
          ingredientId: id,
          organizationId,
          quantity: OPENING_STOCK,
          unitCost: null,
        })),
      );
    });

    console.log('Seeded organization e2e-store');
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
