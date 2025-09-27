import { v5 as uuidv5 } from 'uuid';

import { Prisma, PrismaClient } from '@prisma/client';

import { menus } from './data/menus.data';
import { stores } from './data/stores.data';

const prisma = new PrismaClient();

type JsonValue = Prisma.InputJsonValue;

const v5MenuId = (storeId: string, menuId: string) => uuidv5(storeId, menuId);
const v5MenuItemId = (storeId: string, menuItemId: string) =>
  uuidv5(storeId, menuItemId);

async function upsertOption(optionId: string, name: JsonValue) {
  await prisma.option.upsert({
    where: { id: optionId },
    create: { id: optionId, name },
    update: { name },
  });
}

async function upsertChoice(
  optionId: string,
  choiceId: string,
  name: JsonValue,
) {
  await prisma.choice.upsert({
    where: { id: choiceId },
    create: { id: choiceId, name, optionId },
    update: { name, optionId },
  });
}

async function upsertRecipeItem(ri: {
  id: string;
  name: JsonValue;
  unit: JsonValue;
}) {
  await prisma.recipeItem.upsert({
    where: { id: ri.id },
    create: { id: ri.id, name: ri.name, unit: ri.unit },
    update: { name: ri.name, unit: ri.unit },
  });
}

async function main() {
  for (const s of stores) {
    await prisma.store.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        name: s.name,
        isActive: true,
      },
      update: {
        name: s.name,
        isActive: true,
      },
    });
  }

  for (const menu of menus) {
    for (const item of menu.items) {
      for (const ri of item.recipes ?? []) {
        await upsertRecipeItem({
          id: ri.id,
          name: ri.name,
          unit: ri.unit,
        });
      }

      for (const opt of item.options ?? []) {
        await upsertOption(opt.id, opt.name);

        for (const ch of opt.choices ?? []) {
          await upsertChoice(opt.id, ch.id, ch.name);

          for (const ri of ch.recipes ?? []) {
            await upsertRecipeItem({
              id: ri.id,
              name: ri.name,
              unit: ri.unit,
            });
          }
        }
      }
    }
  }

  for (const store of stores) {
    for (const menu of menus) {
      const menuId = v5MenuId(store.id, menu.id);

      await prisma.menu.upsert({
        where: { id: menuId },
        create: {
          id: menuId,
          name: menu.name,
          storeId: store.id,
        },
        update: {
          name: menu.name,
          storeId: store.id,
        },
      });

      for (const item of menu.items) {
        const menuItemId = v5MenuItemId(store.id, item.id);

        await prisma.menuItem.upsert({
          where: { id: menuItemId },
          create: {
            id: menuItemId,
            name: item.name,
            description: item.description,
            imageUrl: item.imageUrl,
            isActive: item.isActive,
            price: item.price,
            sold: item.sold ?? 0,
            stock: item.stock ?? null,
            menuId,
          },
          update: {
            name: item.name,
            description: item.description,
            imageUrl: item.imageUrl,
            isActive: item.isActive,
            price: item.price,
            sold: item.sold ?? 0,
            stock: item.stock ?? null,
          },
        });

        await prisma.menuItemRecipe.deleteMany({
          where: { menuItemId },
        });
        for (const r of item.recipes ?? []) {
          await prisma.menuItemRecipe.create({
            data: {
              menuItemId,
              recipeItemId: r.id,
              usage: r.usage,
            },
          });
        }

        for (const opt of item.options ?? []) {
          await prisma.menuItemOption.upsert({
            where: {
              menuItemId_optionId: { menuItemId, optionId: opt.id },
            },
            create: {
              menuItemId,
              optionId: opt.id,
              multiple: opt.multiple ?? false,
              required: opt.required ?? false,
            },
            update: {
              multiple: opt.multiple ?? false,
              required: opt.required ?? false,
            },
          });

          await prisma.menuItemChoice.deleteMany({
            where: { menuItemId, optionId: opt.id },
          });

          for (const ch of opt.choices ?? []) {
            await prisma.menuItemChoice.create({
              data: {
                menuItemId,
                optionId: opt.id,
                choiceId: ch.id,
                extraCost: ch.extraCost ?? 0,
                isActive: ch.isActive ?? true,
                isShared: ch.isShared ?? false,
                sold: ch.sold ?? 0,
                stock: ch.stock ?? null,
              },
            });

            for (const r of ch.recipes ?? []) {
              await prisma.choiceRecipe.create({
                data: {
                  menuItemId,
                  optionId: opt.id,
                  choiceId: ch.id,
                  recipeItemId: r.id,
                  usage: r.usage,
                },
              });
            }
          }
        }
      }
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
