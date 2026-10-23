import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { InventoryTransactionsService } from './inventory-transactions.service.js';

type Tx = Parameters<InventoryTransactionsService['consume']>[1];

const createTx = (
  ingredients: {
    id: string;
    inventoryLevel: string;
    lowStockThreshold: string | null;
    requiredQuantity: string;
  }[],
) => {
  const selects: unknown[][] = [
    [{ sellerId: 'org' }],
    [{ addOns: null, menuItemId: 'latte', orderQuantity: 2 }],
    [{ id: 'recipe', menuItemId: 'latte', recipeYield: 1 }],
    ingredients.map(({ id, requiredQuantity }) => ({
      ingredientId: id,
      recipeId: 'recipe',
      requiredQuantity,
    })),
  ];
  const levels = new Map(
    ingredients.map(({ id, inventoryLevel }) => [id, Number(inventoryLevel)]),
  );
  const sets: unknown[] = [];

  const tx = {
    insert: () => ({ values: () => Promise.resolve() }),
    select: () => ({
      from: () => ({
        where: () => {
          const rows = selects.shift() ?? [];
          return Object.assign(Promise.resolve(rows), {
            orderBy: () => ({ for: () => Promise.resolve(rows) }),
          });
        },
      }),
    }),
    update: () => ({
      set: (values: unknown) => {
        sets.push(values);
        return {
          where: () => ({
            returning: () => {
              const { id, lowStockThreshold, requiredQuantity } =
                ingredients[sets.length - 1];
              const level = levels.get(id)! - Number(requiredQuantity) * 2;
              return Promise.resolve([
                {
                  id,
                  inventoryLevel: String(level),
                  lowStockThreshold,
                  name: { 'zh-TW': id },
                },
              ]);
            },
          }),
        };
      },
    }),
  };

  return tx as unknown as Tx;
};

describe('InventoryTransactionsService.consume', () => {
  const service = new InventoryTransactionsService({} as DrizzleDB);

  it('只回傳這次從高於門檻跌到門檻以下的食材', async () => {
    const lowStock = await service.consume(
      'order',
      createTx([
        {
          id: 'crossed',
          inventoryLevel: '12',
          lowStockThreshold: '10',
          requiredQuantity: '1',
        },
        {
          id: 'alreadyLow',
          inventoryLevel: '8',
          lowStockThreshold: '10',
          requiredQuantity: '1',
        },
        {
          id: 'stillAbove',
          inventoryLevel: '20',
          lowStockThreshold: '10',
          requiredQuantity: '1',
        },
        {
          id: 'noThreshold',
          inventoryLevel: '1',
          lowStockThreshold: null,
          requiredQuantity: '1',
        },
      ]),
    );

    expect(lowStock).toEqual([{ id: 'crossed', name: { 'zh-TW': 'crossed' } }]);
  });

  it('門檻為 0 時剛好扣到 0 才算跌破', async () => {
    const lowStock = await service.consume(
      'order',
      createTx([
        {
          id: 'empty',
          inventoryLevel: '2',
          lowStockThreshold: '0',
          requiredQuantity: '1',
        },
      ]),
    );

    expect(lowStock).toEqual([{ id: 'empty', name: { 'zh-TW': 'empty' } }]);
  });
});
