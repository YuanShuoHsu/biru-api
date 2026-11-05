import { ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PGlite } from '@electric-sql/pglite';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import type { BaseUnitCode } from '../common/constants/units.js';
import * as schema from '../db/schema/index.js';
import {
  ingredient,
  recipe,
  recipeIngredient,
} from '../db/schema/inventory.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { IngredientsService } from './ingredients.service.js';
import { InventoryTransactionsService } from './inventory-transactions.service.js';
import {
  bindMenuItemByRecipeName,
  bindRecipeByMenuItemName,
} from './recipe-menu-item-binding.js';
import { RecipesService } from './recipes.service.js';

const ORG = 'org';
const OTHER_ORG = 'other';

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return (error as { getResponse: () => { code: string } }).getResponse()
      .code;
  }

  throw new Error('expected a rejection');
};

describe('來源食譜', () => {
  let client: PGlite;
  let db: DrizzleDB;
  let ingredients: IngredientsService;
  let recipes: RecipesService;
  let transactions: InventoryTransactionsService;

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    db = pglite as unknown as DrizzleDB;
    transactions = new InventoryTransactionsService(db, new EventEmitter2());
    ingredients = new IngredientsService(db, transactions);
    recipes = new RecipesService(db);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(
      'truncate recipe, ingredient, menu, organization cascade',
    );
    for (const id of [ORG, OTHER_ORG])
      await client.query(
        `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, $1, $1, now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
        [id],
      );
    await client.exec(
      `insert into menu (id, organization_id, name) values ('menu', '${ORG}', '{"zh-TW":"菜單"}')`,
    );
    await db.insert(ingredient).values([
      {
        id: 'tomato',
        eligibleQuantity: '1000',
        eligibleQuantityUnitCode: 'GRM',
        name: { 'zh-TW': '番茄' },
        organizationId: ORG,
        price: '100',
        unitCode: 'GRM',
      },
      {
        id: 'salt',
        eligibleQuantity: '1',
        eligibleQuantityUnitCode: 'KGM',
        name: { 'zh-TW': '鹽' },
        organizationId: ORG,
        price: '20',
        unitCode: 'GRM',
      },
      {
        id: 'basil',
        name: { 'zh-TW': '羅勒' },
        organizationId: ORG,
        unitCode: 'GRM',
      },
    ]);
    await db.insert(recipe).values([
      {
        id: 'sauceRecipe',
        name: { 'zh-TW': '番茄醬' },
        organizationId: ORG,
        recipeYieldQuantity: '1.01',
        recipeYieldUnitCode: 'KGM',
      },
      {
        id: 'noYield',
        name: { 'zh-TW': '沒產量' },
        organizationId: ORG,
      },
      {
        id: 'otherRecipe',
        name: { 'zh-TW': '別店' },
        organizationId: OTHER_ORG,
        recipeYieldQuantity: '1',
        recipeYieldUnitCode: 'GRM',
      },
    ]);
    await db.insert(recipeIngredient).values([
      {
        id: 'line-tomato',
        ingredientId: 'tomato',
        recipeId: 'sauceRecipe',
        requiredQuantity: '1000',
      },
      {
        id: 'line-salt',
        ingredientId: 'salt',
        recipeId: 'sauceRecipe',
        requiredQuantity: '50',
      },
    ]);
  });

  const createSauce = (
    recipeId = 'sauceRecipe',
    unitCode: BaseUnitCode = 'GRM',
  ) =>
    ingredients.create(ORG, {
      name: { 'zh-TW': '自製番茄醬' },
      recipeId,
      unitCode,
    });

  const addMenuItem = (id: string, name: string) =>
    client.query(
      `insert into menu_item (id, menu_id, name) values ($1, 'menu', $2)`,
      [id, JSON.stringify({ 'zh-TW': name })],
    );

  const addModifier = async (id: string, name: string, menuId = 'menu') => {
    await client.query(
      `insert into modifier_group (id, menu_id, display_name) values ($1, $2, '{"zh-TW":"群組"}') on conflict do nothing`,
      [`${menuId}-group`, menuId],
    );
    await client.query(
      `insert into modifier (id, modifier_group_id, display_name) values ($1, $2, $3)`,
      [id, `${menuId}-group`, JSON.stringify({ 'zh-TW': name })],
    );
  };

  describe('綁定客製選項', () => {
    it('選項食譜沒給份量時為 1，不依名稱綁到同名品項，解除綁定時也不會', async () => {
      await addModifier('large', '加大');
      await addMenuItem('item', '加大');

      const created = await recipes.create(ORG, {
        modifierId: 'large',
        name: { 'zh-TW': '加大' },
      });

      expect(created).toMatchObject({
        menuItemId: null,
        modifierId: 'large',
        recipeYield: 1,
      });
      expect(
        await recipes.update(created.id, { modifierId: null }),
      ).toMatchObject({ menuItemId: null, modifierId: null });
    });

    it('選項食譜的份量不是 1 時拒絕', async () => {
      await addModifier('large', '加大');
      await addModifier('small', '小份');

      expect(
        await codeOf(
          recipes.create(ORG, {
            modifierId: 'large',
            name: { 'zh-TW': '加大' },
            recipeYield: 4,
          }),
        ),
      ).toBe('modifierRecipeYieldNotOne');

      const { id } = await recipes.create(ORG, {
        modifierId: 'large',
        name: { 'zh-TW': '加大' },
      });
      expect(await codeOf(recipes.update(id, { recipeYield: 3 }))).toBe(
        'modifierRecipeYieldNotOne',
      );

      await recipes.update('noYield', { recipeYield: 2 });
      expect(
        await codeOf(recipes.update('noYield', { modifierId: 'small' })),
      ).toBe('modifierRecipeYieldNotOne');
      expect(
        await recipes.update('noYield', {
          modifierId: 'small',
          recipeYield: 1,
        }),
      ).toMatchObject({ modifierId: 'small', recipeYield: 1 });
    });

    it('已綁選項的食譜不會依名稱綁到同名品項', async () => {
      await addModifier('large', '番茄醬');
      await addMenuItem('item', '番茄醬');
      await recipes.update('noYield', { modifierId: 'large' });

      expect(
        await bindMenuItemByRecipeName(db, {
          name: { 'zh-TW': '番茄醬' },
          organizationId: ORG,
          recipeId: 'noYield',
        }),
      ).toBeNull();
      expect((await recipes.findOne('noYield')).menuItemId).toBeNull();
    });

    it('品項不會依名稱綁到已綁選項的食譜', async () => {
      await addModifier('large', '番茄醬');
      await addMenuItem('item', '番茄醬');
      await recipes.update('sauceRecipe', { modifierId: 'large' });

      expect(
        await bindRecipeByMenuItemName(db, {
          menuItemId: 'item',
          name: { 'zh-TW': '番茄醬' },
          organizationId: ORG,
        }),
      ).toBeNull();
    });

    it('別家店的選項找不到', async () => {
      await client.exec(
        `insert into menu (id, organization_id, name) values ('otherMenu', '${OTHER_ORG}', '{"zh-TW":"別店菜單"}')`,
      );
      await addModifier('otherLarge', '加大', 'otherMenu');

      expect(
        await codeOf(
          recipes.create(ORG, {
            modifierId: 'otherLarge',
            name: { 'zh-TW': '加大' },
          }),
        ),
      ).toBe('modifierNotFound');
      expect(
        await codeOf(recipes.update('noYield', { modifierId: 'otherLarge' })),
      ).toBe('modifierNotFound');
    });

    it('不能同時綁品項與選項', async () => {
      await addModifier('large', '加大');
      await addMenuItem('item', '義大利麵');

      expect(
        await codeOf(
          recipes.create(ORG, {
            menuItemId: 'item',
            modifierId: 'large',
            name: { 'zh-TW': '加大' },
          }),
        ),
      ).toBe('recipeMenuItemAndModifier');

      await recipes.update('noYield', { menuItemId: 'item' });
      expect(
        await codeOf(recipes.update('noYield', { modifierId: 'large' })),
      ).toBe('recipeMenuItemAndModifier');
      expect(
        await recipes.update('noYield', {
          menuItemId: null,
          modifierId: 'large',
        }),
      ).toMatchObject({ menuItemId: null, modifierId: 'large' });
    });

    it('選項或品項已經有食譜時回 409', async () => {
      await addModifier('large', '加大');
      await addMenuItem('item', '義大利麵');
      await recipes.create(ORG, {
        modifierId: 'large',
        name: { 'zh-TW': '加大' },
      });
      await recipes.update('noYield', { menuItemId: 'item' });

      const modifierTaken = recipes.create(ORG, {
        modifierId: 'large',
        name: { 'zh-TW': '加大二' },
      });
      await expect(modifierTaken).rejects.toBeInstanceOf(ConflictException);
      expect(await codeOf(modifierTaken)).toBe('recipeModifierTaken');
      expect(
        await codeOf(recipes.update('sauceRecipe', { modifierId: 'large' })),
      ).toBe('recipeModifierTaken');
      expect(
        await codeOf(
          recipes.create(ORG, {
            menuItemId: 'item',
            name: { 'zh-TW': '義大利麵二' },
          }),
        ),
      ).toBe('recipeMenuItemTaken');
      expect(
        await codeOf(recipes.update('sauceRecipe', { menuItemId: 'item' })),
      ).toBe('recipeMenuItemTaken');
    });

    it('已綁選項的食譜不能當來源，來源食譜也不能綁選項', async () => {
      await addModifier('large', '加大');
      await db
        .update(recipe)
        .set({ modifierId: 'large' })
        .where(eq(recipe.id, 'sauceRecipe'));

      expect(await codeOf(createSauce())).toBe('sourceRecipeHasModifier');

      await db
        .update(recipe)
        .set({ modifierId: null })
        .where(eq(recipe.id, 'sauceRecipe'));
      await createSauce();

      expect(
        await codeOf(recipes.update('sauceRecipe', { modifierId: 'large' })),
      ).toBe('sourceRecipeHasModifier');
    });
  });

  describe('單價', () => {
    it('來源食譜的材料成本除以產量換算成每基準單位', async () => {
      const sauce = await createSauce();

      expect(sauce.unitPrice).toBeCloseTo(0.1);
      expect((await ingredients.findOne(sauce.id)).unitPrice).toBeCloseTo(0.1);
      expect(
        (await ingredients.findAll(ORG)).data.find(({ id }) => id === sauce.id)
          ?.unitPrice,
      ).toBeCloseTo(0.1);
    });

    it('沒有來源食譜的食材照包裝價格推算', async () => {
      expect((await ingredients.findOne('tomato')).unitPrice).toBeCloseTo(0.1);
      expect((await ingredients.findOne('salt')).unitPrice).toBeCloseTo(0.02);
      expect((await ingredients.findOne('basil')).unitPrice).toBeNull();
    });

    it('食譜材料用到半成品時以推算的單價計成本', async () => {
      const sauce = await createSauce();
      const { id: pizza } = await recipes.create(ORG, {
        menuItemId: null,
        name: { 'zh-TW': '披薩' },
      });
      const material = await recipes.createIngredient(pizza, {
        ingredientId: sauce.id,
        requiredQuantity: '200',
      });

      expect(material.cost).toBeCloseTo(20);
      expect((await recipes.findOne(pizza)).cost).toBeCloseTo(20);
    });

    it('盤點增加時以推算的單價記進價', async () => {
      const sauce = await createSauce();

      const created = await transactions.create(sauce.id, {
        inventoryLevel: '500',
      });

      expect(Number(created.unitCost)).toBeCloseTo(0.1);
    });

    it('任一材料缺單價時為 null', async () => {
      const sauce = await createSauce();
      await db.insert(recipeIngredient).values({
        id: 'line-basil',
        ingredientId: 'basil',
        recipeId: 'sauceRecipe',
        requiredQuantity: '5',
      });

      expect((await ingredients.findOne(sauce.id)).unitPrice).toBeNull();
    });
  });

  describe('採購欄位', () => {
    it.each([
      { price: '10' },
      { eligibleQuantity: '1' },
      { eligibleQuantityUnitCode: 'GRM' as const },
      { supplierId: 'supplier' },
    ])('有來源食譜的食材不能再改 %o', async (fields) => {
      const sauce = await createSauce();

      expect(await codeOf(ingredients.update(sauce.id, fields))).toBe(
        'purchaseFieldsOnSourcedIngredient',
      );
    });

    it('指定來源食譜時清掉包裝、價錢與供應商', async () => {
      await client.query(
        `insert into supplier (id, name, organization_id) values ('supplier', '菜商', $1)`,
        [ORG],
      );
      await db.insert(ingredient).values({
        id: 'paste',
        eligibleQuantity: '500',
        eligibleQuantityUnitCode: 'GRM',
        name: { 'zh-TW': '番茄糊' },
        organizationId: ORG,
        price: '80',
        supplierId: 'supplier',
        unitCode: 'GRM',
      });

      const linked = await ingredients.update('paste', {
        recipeId: 'sauceRecipe',
      });

      expect(linked).toMatchObject({
        eligibleQuantity: null,
        eligibleQuantityUnitCode: null,
        price: null,
        recipeId: 'sauceRecipe',
        supplierId: null,
        supplierName: null,
      });
      expect(linked.unitPrice).toBeCloseTo(0.1);
    });

    it('取消來源食譜時包裝與價錢必填', async () => {
      const sauce = await createSauce();

      expect(
        await codeOf(ingredients.update(sauce.id, { recipeId: null })),
      ).toBe('packageRequired');
      expect(
        await codeOf(
          ingredients.update(sauce.id, { recipeId: null, price: '50' }),
        ),
      ).toBe('packageRequired');
    });

    it('取消來源食譜並帶齊包裝後改用包裝價格', async () => {
      const sauce = await createSauce();

      const unlinked = await ingredients.update(sauce.id, {
        eligibleQuantity: '500',
        eligibleQuantityUnitCode: 'GRM',
        price: '50',
        recipeId: null,
      });

      expect(unlinked.recipeId).toBeNull();
      expect(unlinked.unitPrice).toBeCloseTo(0.1);
    });
  });

  describe('設定來源食譜', () => {
    it('別家店的食譜找不到', async () => {
      expect(await codeOf(createSauce('otherRecipe'))).toBe('recipeNotFound');
    });

    it('沒設產量的食譜不能當來源', async () => {
      expect(await codeOf(createSauce('noYield'))).toBe(
        'sourceRecipeYieldMissing',
      );
    });

    it('產量單位與庫存單位不同維度時拒絕', async () => {
      expect(await codeOf(createSauce('sauceRecipe', 'MLT'))).toBe(
        'sourceRecipeUnitIncompatible',
      );
    });

    it('已綁菜單品項的食譜不能當來源', async () => {
      await addMenuItem('item', '番茄醬');
      await db
        .update(recipe)
        .set({ menuItemId: 'item' })
        .where(eq(recipe.id, 'sauceRecipe'));

      expect(await codeOf(createSauce())).toBe('sourceRecipeHasMenuItem');
    });

    it('材料裡有半成品的食譜不能當來源', async () => {
      const sauce = await createSauce();
      await db.insert(recipe).values({
        id: 'pastaSauce',
        name: { 'zh-TW': '義大利麵醬' },
        organizationId: ORG,
        recipeYieldQuantity: '1',
        recipeYieldUnitCode: 'KGM',
      });
      await db.insert(recipeIngredient).values({
        id: 'line-sauce',
        ingredientId: sauce.id,
        recipeId: 'pastaSauce',
        requiredQuantity: '100',
      });

      expect(await codeOf(createSauce('pastaSauce'))).toBe(
        'sourceRecipeNested',
      );
    });

    it('已是來源食譜材料的食材不能再指定來源食譜', async () => {
      await createSauce();

      expect(
        await codeOf(ingredients.update('tomato', { recipeId: 'noYield' })),
      ).toBe('sourceRecipeYieldMissing');
      await db
        .update(recipe)
        .set({ recipeYieldQuantity: '1', recipeYieldUnitCode: 'GRM' })
        .where(eq(recipe.id, 'noYield'));
      expect(
        await codeOf(ingredients.update('tomato', { recipeId: 'noYield' })),
      ).toBe('sourceRecipeNested');
    });

    it('改庫存單位時重新檢查與來源食譜的維度', async () => {
      const sauce = await createSauce();

      expect(
        await codeOf(ingredients.update(sauce.id, { unitCode: 'MLT' })),
      ).toBe('sourceRecipeUnitIncompatible');
    });
  });

  describe('來源食譜本身的異動', () => {
    it('不能加入有來源食譜的材料', async () => {
      const sauce = await createSauce();

      expect(
        await codeOf(
          recipes.createIngredient('sauceRecipe', {
            ingredientId: sauce.id,
            requiredQuantity: '1',
          }),
        ),
      ).toBe('sourceRecipeNested');
      expect(
        await codeOf(
          recipes.updateIngredient('sauceRecipe', 'line-salt', {
            ingredientId: sauce.id,
          }),
        ),
      ).toBe('sourceRecipeNested');
    });

    it('不能清掉產量', async () => {
      await createSauce();

      expect(
        await codeOf(
          recipes.update('sauceRecipe', {
            recipeYieldQuantity: null,
            recipeYieldUnitCode: null,
          }),
        ),
      ).toBe('sourceRecipeYieldMissing');
    });

    it('不能改成不同維度的產量單位', async () => {
      await createSauce();

      expect(
        await codeOf(
          recipes.update('sauceRecipe', {
            recipeYieldQuantity: '1',
            recipeYieldUnitCode: 'LTR',
          }),
        ),
      ).toBe('sourceRecipeUnitIncompatible');
    });

    it('不能綁菜單品項', async () => {
      await createSauce();
      await addMenuItem('item', '番茄醬');

      expect(
        await codeOf(recipes.update('sauceRecipe', { menuItemId: 'item' })),
      ).toBe('sourceRecipeHasMenuItem');
    });

    it('沒有食材用它當來源時照常更新', async () => {
      const updated = await recipes.update('noYield', {
        recipeYieldQuantity: '2',
        recipeYieldUnitCode: 'LTR',
      });

      expect(updated).toMatchObject({
        recipeYieldQuantity: '2.000',
        recipeYieldUnitCode: 'LTR',
      });
    });
  });

  describe('依名稱自動綁定', () => {
    it('品項不會綁到被當作來源的同名食譜', async () => {
      await createSauce();
      await addMenuItem('item', '番茄醬');

      expect(
        await bindRecipeByMenuItemName(db, {
          menuItemId: 'item',
          name: { 'zh-TW': '番茄醬' },
          organizationId: ORG,
        }),
      ).toBeNull();
    });

    it('來源食譜不會綁到同名品項', async () => {
      await createSauce();
      await addMenuItem('item', '番茄醬');

      expect(
        await bindMenuItemByRecipeName(db, {
          name: { 'zh-TW': '番茄醬' },
          organizationId: ORG,
          recipeId: 'sauceRecipe',
        }),
      ).toBeNull();
    });

    it('沒被當作來源的同名食譜照常綁定', async () => {
      await addMenuItem('item', '番茄醬');

      expect(
        await bindRecipeByMenuItemName(db, {
          menuItemId: 'item',
          name: { 'zh-TW': '番茄醬' },
          organizationId: ORG,
        }),
      ).toMatchObject({ id: 'sauceRecipe' });
    });
  });
});
