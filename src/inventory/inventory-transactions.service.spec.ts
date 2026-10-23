import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { InventoryTransactionsService } from './inventory-transactions.service.js';

type Tx = Parameters<InventoryTransactionsService['consume']>[1];

const createTx = (
  ingredients: {
    id: string;
    before: string;
    after: string;
    lowStockThreshold: string | null;
  }[],
) => {
  const locked = ingredients.map(({ before, id, lowStockThreshold }) => ({
    id,
    inventoryLevel: before,
    lowStockThreshold,
    name: { 'zh-TW': id },
  }));
  const selects: unknown[][] = [
    [{ sellerId: 'org' }],
    [{ addOns: null, menuItemId: 'latte', orderQuantity: 1 }],
    [{ id: 'recipe', menuItemId: 'latte', recipeYield: 3 }],
    ingredients.map(({ id }) => ({
      ingredientId: id,
      recipeId: 'recipe',
      requiredQuantity: '1',
    })),
  ];
  let updates = 0;

  const tx = {
    insert: () => ({ values: () => Promise.resolve() }),
    select: () => ({
      from: () => ({
        where: () =>
          Object.assign(Promise.resolve(selects.shift() ?? []), {
            orderBy: () => ({ for: () => Promise.resolve(locked) }),
          }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () =>
            Promise.resolve([{ inventoryLevel: ingredients[updates++].after }]),
        }),
      }),
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
          before: '10.200',
          after: '9.867',
          lowStockThreshold: '10',
        },
        {
          id: 'alreadyAtThreshold',
          before: '10.000',
          after: '9.667',
          lowStockThreshold: '10',
        },
        {
          id: 'stillAbove',
          before: '20.000',
          after: '19.667',
          lowStockThreshold: '10',
        },
        {
          id: 'noThreshold',
          before: '0.200',
          after: '-0.133',
          lowStockThreshold: null,
        },
      ]),
    );

    expect(lowStock).toEqual([{ id: 'crossed', name: { 'zh-TW': 'crossed' } }]);
  });

  it('門檻為 0 時扣到 0 才算跌破', async () => {
    const lowStock = await service.consume(
      'order',
      createTx([
        {
          id: 'empty',
          before: '0.333',
          after: '0.000',
          lowStockThreshold: '0',
        },
      ]),
    );

    expect(lowStock).toEqual([{ id: 'empty', name: { 'zh-TW': 'empty' } }]);
  });
});
