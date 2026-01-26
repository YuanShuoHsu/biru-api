import { randomUUID } from 'crypto';

import { stores as storesData } from './data/stores';

import { db } from '../index';
import {
  menuItemIngredients,
  menuItemOptionChoiceIngredients,
  menuItemOptionChoices,
  menuItemOptions,
  menuItems,
  menus,
  stores,
  tables,
} from '../schema';

async function main() {
  for (const s of storesData) {
    const [store] = await db
      .insert(stores)
      .values({
        id: s.id,
        name: s.name,
        address: s.address,
        createdAt: s.createdAt,
        isActive: s.isActive,
        slug: s.slug,
        updatedAt: s.updatedAt,
      })
      .onConflictDoUpdate({
        target: stores.slug,
        set: {
          name: s.name,
          address: s.address,
          isActive: s.isActive,
          updatedAt: new Date(),
        },
      })
      .returning();

    for (const t of s.tables) {
      await db
        .insert(tables)
        .values({
          id: randomUUID(),
          storeId: store.id,
          name: t.name,
          slug: t.slug,
          isActive: t.isActive,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })
        .onConflictDoUpdate({
          target: [tables.storeId, tables.slug],
          set: {
            name: t.name,
            isActive: t.isActive,
            updatedAt: new Date(),
          },
        });
    }

    for (const m of s.menus) {
      const [menu] = await db
        .insert(menus)
        .values({
          id: randomUUID(),
          key: m.key,
          name: m.name,
          createdAt: m.createdAt,
          isActive: m.isActive,
          updatedAt: m.updatedAt,
          storeId: store.id,
        })
        .onConflictDoUpdate({
          target: [menus.storeId, menus.key],
          set: {
            name: m.name,
            isActive: m.isActive,
            updatedAt: new Date(),
          },
        })
        .returning();

      for (const mi of m.items) {
        const [menuItem] = await db
          .insert(menuItems)
          .values({
            id: randomUUID(),
            key: mi.key,
            name: mi.name,
            createdAt: mi.createdAt,
            description: mi.description,
            imageUrl: mi.imageUrl,
            isActive: mi.isActive,
            price: mi.price,
            sold: mi.sold,
            stock: mi.stock,
            updatedAt: mi.updatedAt,
            menuId: menu.id,
          })
          .onConflictDoUpdate({
            target: [menuItems.menuId, menuItems.key],
            set: {
              name: mi.name,
              description: mi.description,
              imageUrl: mi.imageUrl,
              isActive: mi.isActive,
              price: mi.price,
              sold: mi.sold,
              stock: mi.stock,
              updatedAt: new Date(),
            },
          })
          .returning();

        for (const ing of mi.ingredients) {
          await db
            .insert(menuItemIngredients)
            .values({
              id: randomUUID(),
              key: ing.key,
              name: ing.name,
              unit: ing.unit,
              usage: ing.usage,
              createdAt: ing.createdAt,
              updatedAt: ing.updatedAt,
              menuItemId: menuItem.id,
            })
            .onConflictDoUpdate({
              target: [menuItemIngredients.menuItemId, menuItemIngredients.key],
              set: {
                name: ing.name,
                unit: ing.unit,
                usage: ing.usage,
                updatedAt: new Date(),
              },
            });
        }

        for (const opt of mi.options) {
          const [option] = await db
            .insert(menuItemOptions)
            .values({
              id: randomUUID(),
              key: opt.key,
              name: opt.name,
              createdAt: opt.createdAt,
              isActive: opt.isActive,
              multiple: opt.multiple,
              required: opt.required,
              updatedAt: opt.updatedAt,
              menuItemId: menuItem.id,
            })
            .onConflictDoUpdate({
              target: [menuItemOptions.menuItemId, menuItemOptions.key],
              set: {
                name: opt.name,
                isActive: opt.isActive,
                multiple: opt.multiple,
                required: opt.required,
                updatedAt: new Date(),
              },
            })
            .returning();

          for (const ch of opt.choices) {
            const [choice] = await db
              .insert(menuItemOptionChoices)
              .values({
                id: randomUUID(),
                key: ch.key,
                name: ch.name,
                createdAt: ch.createdAt,
                extraCost: ch.extraCost,
                isActive: ch.isActive,
                isShared: ch.isShared,
                sold: ch.sold,
                stock: ch.stock,
                updatedAt: ch.updatedAt,
                menuItemOptionId: option.id,
              })
              .onConflictDoUpdate({
                target: [
                  menuItemOptionChoices.menuItemOptionId,
                  menuItemOptionChoices.key,
                ],
                set: {
                  name: ch.name,
                  extraCost: ch.extraCost,
                  isActive: ch.isActive,
                  isShared: ch.isShared,
                  sold: ch.sold,
                  stock: ch.stock,
                  updatedAt: new Date(),
                },
              })
              .returning();

            for (const cing of ch.ingredients) {
              await db
                .insert(menuItemOptionChoiceIngredients)
                .values({
                  id: randomUUID(),
                  key: cing.key,
                  name: cing.name,
                  createdAt: cing.createdAt,
                  unit: cing.unit,
                  updatedAt: cing.updatedAt,
                  usage: cing.usage,
                  menuItemOptionChoiceId: choice.id,
                })
                .onConflictDoUpdate({
                  target: [
                    menuItemOptionChoiceIngredients.menuItemOptionChoiceId,
                    menuItemOptionChoiceIngredients.key,
                  ],
                  set: {
                    name: cing.name,
                    unit: cing.unit,
                    usage: cing.usage,
                    updatedAt: new Date(),
                  },
                });
            }
          }
        }
      }
    }
  }
}

void main();
