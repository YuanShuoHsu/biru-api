import { BadRequestException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

import type { PriceSpecification } from '../db/schema/menus.js';
import type { OrderMode } from '../db/schema/orders.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import type { CreateOrderItemDto } from './dto/create-order.dto.js';
import { OrderPricingService } from './order-pricing.service.js';

const MENU_ID = 'menu';

const menuItemOf = (id: string, name: string) => ({
  id,
  availableModes: ['counter'],
  fixedSweetnessLevel: null,
  menuId: MENU_ID,
  menuSection: null,
  menuSectionId: null,
  name: { 'zh-TW': name },
  servingTemperatures: [],
  sweetness: 'Fixed',
});

const latte = menuItemOf('latte', '拿鐵');
const cookie = menuItemOf('cookie', '餅乾');

const cartItemOf = (
  overrides: Partial<CreateOrderItemDto> = {},
): CreateOrderItemDto => ({
  addOns: [],
  menuItemId: latte.id,
  modifiers: {},
  quantity: 1,
  ...overrides,
});

const createService = (
  menuItems: object[],
  menuSections: { id: string; parentSectionId: string | null }[] = [],
  priceSpecification: PriceSpecification | null = null,
  itemModifierGroups: object[] = [],
  modifiers: object[] = [],
  menuItemAddOns: object[] = [],
) => {
  const db = {
    query: {
      menuSection: { findMany: vi.fn().mockResolvedValue(menuSections) },
      menu: {
        findFirst: vi.fn().mockResolvedValue({
          id: MENU_ID,
          organization: { currency: 'TWD' },
        }),
      },
      menuItem: { findMany: vi.fn().mockResolvedValue(menuItems) },
      menuItemAddOn: { findMany: vi.fn().mockResolvedValue(menuItemAddOns) },
      menuItemModifierGroup: {
        findMany: vi.fn().mockResolvedValue(itemModifierGroups),
      },
      modifier: { findMany: vi.fn().mockResolvedValue(modifiers) },
      offer: {
        findMany: vi.fn().mockResolvedValue(
          menuItems.map(({ id }: { id?: string }) => ({
            availability: 'InStock',
            menuItemId: id,
            price: '100.00',
            priceSpecification,
          })),
        ),
      },
    },
  };

  return new OrderPricingService(db as unknown as DrizzleDB);
};

beforeEach(() => {
  vi.spyOn(I18nContext, 'current').mockReturnValue({
    t: (key: string, options?: { args?: { name?: string } }) =>
      options?.args?.name ? `${key}:${options.args.name}` : key,
  } as unknown as I18nContext);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OrderPricingService.resolveOrderItems', () => {
  it('購物車裡的品項已被店家刪除時提示菜單已更新', async () => {
    const service = createService([]);

    const result = service.resolveOrderItems('org', [cartItemOf()], 'counter');

    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.toThrow('common.orders.menuChanged');
  });

  it('品項改成可調甜度後沒帶甜度，以品項名稱提示重新確認選項', async () => {
    const service = createService([{ ...latte, sweetness: 'Adjustable' }]);

    await expect(
      service.resolveOrderItems('org', [cartItemOf()], 'counter'),
    ).rejects.toThrow('common.orders.menuItemOptionsInvalid:拿鐵');
  });

  it('加購品已不再搭配主品項時，以主品項名稱提示重新確認選項', async () => {
    const service = createService([latte, cookie]);

    await expect(
      service.resolveOrderItems(
        'org',
        [
          cartItemOf({
            addOns: [{ menuItemId: cookie.id, modifiers: {} }],
          }),
        ],
        'counter',
      ),
    ).rejects.toThrow('common.orders.menuItemOptionsInvalid:拿鐵');
  });

  it('品項的分類清單包含所有上層分類，讓最上層分類的優惠券也套得到', async () => {
    const service = createService(
      [{ ...latte, menuSectionId: 'oolong' }],
      [
        { id: 'drinks', parentSectionId: null },
        { id: 'tea', parentSectionId: 'drinks' },
        { id: 'oolong', parentSectionId: 'tea' },
      ],
    );

    const [item] = await service.resolveOrderItems(
      'org',
      [cartItemOf()],
      'counter',
    );

    expect(item.menuSectionIds).toEqual(['oolong', 'tea', 'drinks']);
  });

  describe('必選群組只在點餐模式有可選選項時要求選擇', () => {
    const dineInLatte = { ...latte, availableModes: ['counter', 'dineIn'] };
    const sealingGroupOf = (
      modifiers: { availability: string; availableModes: string[] }[],
    ) => [
      {
        menuItemId: latte.id,
        modifierGroup: {
          id: 'sealing',
          maxSelectionCount: 1,
          minSelectionCount: 1,
          modifiers,
        },
      },
    ];
    const takeoutOnly = {
      availability: 'InStock',
      availableModes: ['counter'],
    };

    it('選項都不在內用販售時，內用不必選', async () => {
      const service = createService(
        [dineInLatte],
        [],
        null,
        sealingGroupOf([takeoutOnly, takeoutOnly]),
      );

      const [item] = await service.resolveOrderItems(
        'org',
        [cartItemOf()],
        'dineIn',
      );

      expect(item.modifiers).toEqual([]);
    });

    it('有選項在該點餐模式販售時仍必須選擇', async () => {
      const service = createService(
        [dineInLatte],
        [],
        null,
        sealingGroupOf([takeoutOnly]),
      );

      await expect(
        service.resolveOrderItems('org', [cartItemOf()], 'counter'),
      ).rejects.toThrow('common.orders.menuItemOptionsInvalid:拿鐵');
    });

    it('已停售的選項不算在該點餐模式可選', async () => {
      const service = createService(
        [dineInLatte],
        [],
        null,
        sealingGroupOf([
          takeoutOnly,
          { availability: 'Discontinued', availableModes: ['dineIn'] },
        ]),
      );

      const [item] = await service.resolveOrderItems(
        'org',
        [cartItemOf()],
        'dineIn',
      );

      expect(item.modifiers).toEqual([]);
    });

    it('選項全部停售的必選群組仍擋下訂單', async () => {
      const service = createService(
        [dineInLatte],
        [],
        null,
        sealingGroupOf([{ availability: 'Discontinued', availableModes: [] }]),
      );

      await expect(
        service.resolveOrderItems('org', [cartItemOf()], 'dineIn'),
      ).rejects.toThrow('common.orders.menuItemOptionsInvalid:拿鐵');
    });
  });

  describe('促銷價依平台時區的日期判斷，起訖兩天都含整天', () => {
    const unitPriceAt = async (
      time: string,
      priceSpecification: PriceSpecification,
    ) => {
      vi.useFakeTimers({ now: new Date(time), toFake: ['Date'] });
      const service = createService([latte], [], priceSpecification);
      const [item] = await service.resolveOrderItems(
        'org',
        [cartItemOf()],
        'counter',
      );
      return item.unitPrice;
    };

    const june = {
      price: '80.00',
      validFrom: '2026-06-01',
      validThrough: '2026-06-30',
    };

    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([
      ['2026-05-31T23:59:59+08:00', '100.00'],
      ['2026-06-01T00:00:00+08:00', '80.00'],
      ['2026-06-30T23:59:59+08:00', '80.00'],
      ['2026-07-01T00:00:00+08:00', '100.00'],
    ])('%s 的單價為 %s', async (time, unitPrice) => {
      expect(await unitPriceAt(time, june)).toBe(unitPrice);
    });

    it.each([
      ['2026-06-01T00:00:00+08:00', '80.00'],
      ['2026-06-01T23:59:59+08:00', '80.00'],
      ['2026-06-02T00:00:00+08:00', '100.00'],
    ])('單日促銷在 %s 的單價為 %s', async (time, unitPrice) => {
      expect(
        await unitPriceAt(time, {
          price: '80.00',
          validFrom: '2026-06-01',
          validThrough: '2026-06-01',
        }),
      ).toBe(unitPrice);
    });

    it('沒有結束日的促銷開始後一直有效', async () => {
      expect(
        await unitPriceAt('2030-01-01T12:00:00+08:00', {
          price: '80.00',
          validFrom: '2026-06-01',
        }),
      ).toBe('80.00');
    });

    it('沒有開始日的促銷到結束日當天都有效', async () => {
      expect(
        await unitPriceAt('2026-06-30T23:59:59+08:00', {
          price: '80.00',
          validThrough: '2026-06-30',
        }),
      ).toBe('80.00');
    });

    it('舊資料的日期時間取其平台時區日期', async () => {
      expect(
        await unitPriceAt('2026-06-30T23:00:00+08:00', {
          price: '80.00',
          validFrom: '2026-05-31T16:00:00Z',
          validThrough: '2026-06-30T00:00:00+08:00',
        }),
      ).toBe('80.00');
    });

    it('舊資料 UTC 時間跨到隔天時，以平台時區日期判斷起日', async () => {
      expect(
        await unitPriceAt('2026-05-31T23:00:00+08:00', {
          price: '80.00',
          validFrom: '2026-05-31T16:00:00Z',
        }),
      ).toBe('100.00');
    });

    it('舊資料 UTC 時間跨到隔天時，以平台時區日期判斷訖日', async () => {
      expect(
        await unitPriceAt('2026-06-01T12:00:00+08:00', {
          price: '80.00',
          validThrough: '2026-05-31T16:00:00Z',
        }),
      ).toBe('80.00');
    });

    it.each([
      '2026-W01',
      '20260601',
      '2026-06-01T00:00:00',
      '2026-06-01 00:00Z',
    ])('無法解析的日期 %s 不套用促銷價', async (validFrom) => {
      expect(
        await unitPriceAt('2026-06-15T12:00:00+08:00', {
          price: '80.00',
          validFrom,
        }),
      ).toBe('100.00');
    });
  });

  describe('自備環保杯每杯少 5 元，最低 0 元', () => {
    const cupGroupOf = (menuItemId: string, maxSelectionCount = 1) => ({
      menuItemId,
      modifierGroup: {
        id: 'sealing',
        maxSelectionCount,
        minSelectionCount: 0,
        modifiers: [],
      },
    });
    const modifierOf = (
      id: string,
      customerProvidedCup: boolean | null,
      priceAdjustment: string | null = null,
    ) => ({
      availability: 'InStock',
      availableModes: ['counter'],
      catalogModifier:
        customerProvidedCup === null ? null : { customerProvidedCup },
      displayName: { 'zh-TW': id },
      id,
      modifierGroup: { displayName: { 'zh-TW': '封口方式' }, menuId: MENU_ID },
      modifierGroupId: 'sealing',
      priceAdjustment,
    });
    const ownCup = modifierOf('own-cup', true);

    const resolve = async (
      cartItem: CreateOrderItemDto,
      {
        menuItems = [latte],
        modifiers = [ownCup],
        groups = [cupGroupOf(latte.id)],
        addOnLinks = [] as object[],
        price,
      }: {
        menuItems?: object[];
        modifiers?: object[];
        groups?: object[];
        addOnLinks?: object[];
        price?: string;
      } = {},
    ) => {
      const service = createService(
        menuItems,
        [],
        price ? { price } : null,
        groups,
        modifiers,
        addOnLinks,
      );
      const [item] = await service.resolveOrderItems(
        'org',
        [cartItem],
        'counter',
      );
      return item;
    };

    it('選了自備杯，快照標記自備杯並記下折價，單價少 5 元', async () => {
      const item = await resolve(
        cartItemOf({ modifiers: { sealing: ['own-cup'] } }),
      );

      expect(item.modifiers).toEqual([
        expect.objectContaining({
          customerProvidedCup: true,
          modifierId: 'own-cup',
          priceAdjustment: '-5.00',
        }),
      ]);
      expect(item.unitPrice).toBe('95.00');
    });

    it('選項沒有接上品牌目錄時不折', async () => {
      const item = await resolve(
        cartItemOf({ modifiers: { sealing: ['own-cup'] } }),
        { modifiers: [{ ...ownCup, catalogModifier: null }] },
      );

      expect(item.modifiers[0]).not.toHaveProperty('customerProvidedCup');
      expect(item.modifiers[0].priceAdjustment).toBeNull();
      expect(item.unitPrice).toBe('100.00');
    });

    it('一般選項不折', async () => {
      const item = await resolve(
        cartItemOf({ modifiers: { sealing: ['lid'] } }),
        { modifiers: [modifierOf('lid', false, '0.00')] },
      );

      expect(item.unitPrice).toBe('100.00');
    });

    it('選項在品牌目錄標了杯型或封口時記進快照，沒標的不帶', async () => {
      const item = await resolve(
        cartItemOf({ modifiers: { sealing: ['large', 'film', 'oat'] } }),
        {
          groups: [cupGroupOf(latte.id, 3)],
          modifiers: [
            {
              ...modifierOf('large', false),
              catalogModifier: {
                cupSeal: null,
                cupSize: '16oz',
                customerProvidedCup: false,
              },
            },
            {
              ...modifierOf('film', false),
              catalogModifier: {
                cupSeal: 'film',
                cupSize: null,
                customerProvidedCup: false,
              },
            },
            modifierOf('oat', false),
          ],
        },
      );

      expect(item.modifiers).toEqual([
        expect.objectContaining({ cupSize: '16oz', modifierId: 'large' }),
        expect.objectContaining({ cupSeal: 'film', modifierId: 'film' }),
        expect.objectContaining({ modifierId: 'oat' }),
      ]);
      expect(item.modifiers[0]).not.toHaveProperty('cupSeal');
      expect(item.modifiers[1]).not.toHaveProperty('cupSize');
      expect(item.modifiers[2]).not.toHaveProperty('cupSize');
      expect(item.modifiers[2]).not.toHaveProperty('cupSeal');
    });

    it('售價不到 5 元的飲品折到 0 元為止，快照記下實際折掉的金額', async () => {
      const item = await resolve(
        cartItemOf({ modifiers: { sealing: ['own-cup'] } }),
        { price: '3.00' },
      );

      expect(item.modifiers[0].priceAdjustment).toBe('-3.00');
      expect(item.unitPrice).toBe('0.00');
    });

    it('帶小數的售價折到 0 元時，單價不會變成 -0.00', async () => {
      const item = await resolve(
        cartItemOf({ modifiers: { sealing: ['own-cup', 'own-cup-2'] } }),
        {
          groups: [cupGroupOf(latte.id, 2)],
          modifiers: [ownCup, modifierOf('own-cup-2', true, '2.09')],
          price: '0.01',
        },
      );

      expect(item.unitPrice).toBe('0.00');
    });

    it('同一杯選了多個自備杯選項只折一次', async () => {
      const item = await resolve(
        cartItemOf({ modifiers: { sealing: ['own-cup', 'own-cup-2'] } }),
        {
          groups: [cupGroupOf(latte.id, 2)],
          modifiers: [ownCup, modifierOf('own-cup-2', true, '1.00')],
        },
      );

      expect(item.modifiers.map((m) => m.priceAdjustment)).toEqual([
        '-5.00',
        '1.00',
      ]);
      expect(item.unitPrice).toBe('96.00');
    });

    it('加購的飲品各自折，且只折到該杯 0 元為止，不影響主品項', async () => {
      const item = await resolve(
        cartItemOf({
          addOns: [
            { menuItemId: cookie.id, modifiers: { sealing: ['own-cup'] } },
          ],
          modifiers: { sealing: ['own-cup'] },
        }),
        {
          addOnLinks: [
            {
              addOnMenuItemId: cookie.id,
              addOnMenuSectionId: null,
              menuItemId: latte.id,
            },
          ],
          groups: [cupGroupOf(latte.id), cupGroupOf(cookie.id)],
          menuItems: [latte, cookie],
          price: '4.00',
        },
      );

      expect(item.addOns[0].modifiers[0]).toMatchObject({
        customerProvidedCup: true,
        priceAdjustment: '-4.00',
      });
      expect(item.modifiers[0].priceAdjustment).toBe('-4.00');
      expect(item.unitPrice).toBe('0.00');
    });

    it('主品項有加價選項時，加購杯的折扣不會吃到主品項', async () => {
      const item = await resolve(
        cartItemOf({
          addOns: [
            { menuItemId: cookie.id, modifiers: { sealing: ['own-cup'] } },
          ],
          modifiers: { sealing: ['oat'] },
        }),
        {
          addOnLinks: [
            {
              addOnMenuItemId: cookie.id,
              addOnMenuSectionId: null,
              menuItemId: latte.id,
            },
          ],
          groups: [cupGroupOf(latte.id), cupGroupOf(cookie.id)],
          menuItems: [latte, cookie],
          modifiers: [ownCup, modifierOf('oat', false, '10.00')],
          price: '2.00',
        },
      );

      expect(item.addOns[0].modifiers[0].priceAdjustment).toBe('-2.00');
      expect(item.unitPrice).toBe('12.00');
    });
  });

  describe('外帶飲品下單時決定封口，選了封口照選項，沒選時熱飲杯蓋、冰飲封膜', () => {
    const drinkOf = (id: string, name: string) => ({
      ...menuItemOf(id, name),
      availableModes: ['counter', 'dineIn'],
      servingTemperatures: ['Hot', 'Iced'],
    });
    const drink = drinkOf('latte', '拿鐵');
    const tea = drinkOf('tea', '紅茶');
    const sealingOf = (id: string, catalogModifier: object) => ({
      availability: 'InStock',
      availableModes: ['counter', 'dineIn'],
      catalogModifier,
      displayName: { 'zh-TW': id },
      id,
      modifierGroup: { displayName: { 'zh-TW': '封口方式' }, menuId: MENU_ID },
      modifierGroupId: 'sealing',
      priceAdjustment: null,
    });
    const lid = sealingOf('lid', {
      cupSeal: 'lid',
      cupSize: null,
      customerProvidedCup: false,
    });
    const ownCup = sealingOf('own-cup', {
      cupSeal: null,
      cupSize: null,
      customerProvidedCup: true,
    });

    const resolve = async (
      cartItem: CreateOrderItemDto,
      mode: OrderMode = 'counter',
      menuItems: object[] = [drink, tea],
    ) => {
      const service = createService(
        menuItems,
        [],
        null,
        [drink.id, tea.id].map((menuItemId) => ({
          menuItemId,
          modifierGroup: {
            id: 'sealing',
            maxSelectionCount: 1,
            minSelectionCount: 0,
            modifiers: [],
          },
        })),
        [lid, ownCup],
        [
          {
            addOnMenuItemId: tea.id,
            addOnMenuSectionId: null,
            menuItemId: drink.id,
          },
        ],
      );
      const [item] = await service.resolveOrderItems('org', [cartItem], mode);
      return item;
    };

    it('外帶熱飲沒選封口用杯蓋', async () => {
      const item = await resolve(
        cartItemOf({ servingTemperatureLevel: 'Hot' }),
      );

      expect(item.cupSeal).toBe('lid');
    });

    it('外帶冰飲沒選封口用封膜', async () => {
      const item = await resolve(
        cartItemOf({ servingTemperatureLevel: 'RegularIce' }),
      );

      expect(item.cupSeal).toBe('film');
    });

    it('冰飲選了杯蓋就用杯蓋', async () => {
      const item = await resolve(
        cartItemOf({
          modifiers: { sealing: ['lid'] },
          servingTemperatureLevel: 'LessIce',
        }),
      );

      expect(item.cupSeal).toBe('lid');
    });

    it('自備杯、內用、不分冷熱的品項沒有封口', async () => {
      const ownCupItem = await resolve(
        cartItemOf({
          modifiers: { sealing: ['own-cup'] },
          servingTemperatureLevel: 'Hot',
        }),
      );
      const dineInItem = await resolve(
        cartItemOf({ servingTemperatureLevel: 'Hot' }),
        'dineIn',
      );
      const noTemperatureItem = await resolve(cartItemOf(), 'counter', [
        { ...drink, servingTemperatures: [] },
        tea,
      ]);

      expect(ownCupItem.cupSeal).toBeNull();
      expect(dineInItem.cupSeal).toBeNull();
      expect(noTemperatureItem.cupSeal).toBeNull();
    });

    it('加購的飲品各自決定封口，自備杯不帶', async () => {
      const item = await resolve(
        cartItemOf({
          addOns: [
            {
              menuItemId: tea.id,
              modifiers: {},
              servingTemperatureLevel: 'NoIce',
            },
            {
              menuItemId: tea.id,
              modifiers: { sealing: ['own-cup'] },
              servingTemperatureLevel: 'Hot',
            },
          ],
          servingTemperatureLevel: 'Hot',
        }),
      );

      expect(item.cupSeal).toBe('lid');
      expect(item.addOns[0].cupSeal).toBe('film');
      expect(item.addOns[1]).not.toHaveProperty('cupSeal');
    });

    it('內用的加購飲品不帶封口', async () => {
      const item = await resolve(
        cartItemOf({
          addOns: [
            {
              menuItemId: tea.id,
              modifiers: {},
              servingTemperatureLevel: 'NoIce',
            },
          ],
          servingTemperatureLevel: 'Hot',
        }),
        'dineIn',
      );

      expect(item.addOns[0]).not.toHaveProperty('cupSeal');
    });
  });
});
