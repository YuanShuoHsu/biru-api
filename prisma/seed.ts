import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
import { menus } from './data/menus.data';
import { stores } from './data/stores.data';
import { tables } from './data/tables.data';
import { Prisma, PrismaClient } from './generated/client';

const connectionString = `${process.env.DATABASE_URL}`;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  for (const s of stores) {
    const store = await prisma.store.upsert({
      where: { slug: s.slug },
      create: {
        id: s.id,
        name: s.name,
        createdAt: s.createdAt,
        isActive: s.isActive,
        slug: s.slug,
        updatedAt: s.updatedAt,
      },
      update: {
        name: s.name,
        isActive: s.isActive,
      },
    });

    for (const t of tables) {
      await prisma.table.upsert({
        where: {
          storeId_slug: {
            storeId: store.id,
            slug: t.slug,
          },
        },
        create: {
          storeId: store.id,
          name: t.name,
          slug: t.slug,
          isActive: t.isActive,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        },
        update: {
          name: t.name,
          isActive: t.isActive,
        },
      });
    }

    for (const m of menus) {
      const menu = await prisma.menu.upsert({
        where: { storeId_key: { storeId: store.id, key: m.key } },
        create: {
          key: m.key,
          name: m.name,
          createdAt: m.createdAt,
          isActive: m.isActive,
          updatedAt: m.updatedAt,
          storeId: store.id,
        },
        update: {
          name: m.name,
          isActive: m.isActive,
        },
        select: { id: true, key: true },
      });

      for (const mi of m.items) {
        const menuItem = await prisma.menuItem.upsert({
          where: { menuId_key: { menuId: menu.id, key: mi.key } },
          create: {
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
          },
          update: {
            name: mi.name,
            description: mi.description,
            imageUrl: mi.imageUrl,
            isActive: mi.isActive,
            price: mi.price,
            sold: mi.sold,
            stock: mi.stock,
          },
          select: { id: true, key: true },
        });

        for (const ing of mi.ingredients) {
          await prisma.menuItemIngredient.upsert({
            where: {
              menuItemId_key: { menuItemId: menuItem.id, key: ing.key },
            },
            create: {
              key: ing.key,
              name: ing.name,
              unit: ing.unit,
              usage: new Prisma.Decimal(ing.usage),
              createdAt: ing.createdAt,
              updatedAt: ing.updatedAt,
              menuItemId: menuItem.id,
            },
            update: {
              name: ing.name,
              unit: ing.unit,
              usage: new Prisma.Decimal(ing.usage),
            },
          });
        }

        for (const opt of mi.options) {
          const option = await prisma.menuItemOption.upsert({
            where: {
              menuItemId_key: { menuItemId: menuItem.id, key: opt.key },
            },
            create: {
              key: opt.key,
              name: opt.name,
              createdAt: opt.createdAt,
              isActive: opt.isActive,
              multiple: opt.multiple,
              required: opt.required,
              updatedAt: opt.updatedAt,
              menuItemId: menuItem.id,
            },
            update: {
              name: opt.name,
              isActive: opt.isActive,
              multiple: opt.multiple,
              required: opt.required,
            },
            select: { id: true, key: true },
          });

          for (const ch of opt.choices) {
            const choice = await prisma.menuItemOptionChoice.upsert({
              where: {
                menuItemOptionId_key: {
                  menuItemOptionId: option.id,
                  key: ch.key,
                },
              },
              create: {
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
              },
              update: {
                name: ch.name,
                extraCost: ch.extraCost,
                isActive: ch.isActive,
                isShared: ch.isShared,
                sold: ch.sold,
                stock: ch.stock,
              },
              select: { id: true, key: true },
            });

            for (const cing of ch.ingredients) {
              await prisma.menuItemOptionChoiceIngredient.upsert({
                where: {
                  menuItemOptionChoiceId_key: {
                    menuItemOptionChoiceId: choice.id,
                    key: cing.key,
                  },
                },
                create: {
                  key: cing.key,
                  name: cing.name,
                  unit: cing.unit,
                  usage: new Prisma.Decimal(cing.usage),
                  createdAt: cing.createdAt,
                  updatedAt: cing.updatedAt,
                  menuItemOptionChoiceId: choice.id,
                },
                update: {
                  name: cing.name,
                  unit: cing.unit,
                  usage: new Prisma.Decimal(cing.usage),
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
