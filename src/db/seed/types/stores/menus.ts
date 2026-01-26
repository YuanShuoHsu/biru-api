import {
  menuItemIngredients,
  menuItemOptionChoiceIngredients,
  menuItemOptionChoices,
  menuItemOptions,
  menuItems,
  menus,
} from '../../../schema/stores';

export type MenuItemIngredient = Omit<
  typeof menuItemIngredients.$inferSelect,
  'menuItemId'
>;

export type MenuItemOptionChoiceIngredient = Omit<
  typeof menuItemOptionChoiceIngredients.$inferSelect,
  'menuItemOptionChoiceId'
>;

export type MenuItemOptionChoice = Omit<
  typeof menuItemOptionChoices.$inferSelect,
  'menuItemOptionId'
> & {
  ingredients: MenuItemOptionChoiceIngredient[];
};

export type MenuItemOption = Omit<
  typeof menuItemOptions.$inferSelect,
  'menuItemId'
> & {
  choices: MenuItemOptionChoice[];
};

export type MenuItem = Omit<typeof menuItems.$inferSelect, 'menuId'> & {
  ingredients: MenuItemIngredient[];
  options: MenuItemOption[];
};

export type Menu = Omit<typeof menus.$inferSelect, 'storeId'> & {
  items: MenuItem[];
};
