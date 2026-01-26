import {
  menuItemIngredients,
  menuItemOptionChoiceIngredients,
  menuItemOptionChoices,
  menuItemOptions,
  menuItems,
  menus,
} from '../../schema/stores';

export type Menu = typeof menus.$inferSelect & {
  items: MenuItem[];
};

export type MenuItem = typeof menuItems.$inferSelect & {
  ingredients: MenuItemIngredient[];
  options: MenuItemOption[];
};

export type MenuItemIngredient = typeof menuItemIngredients.$inferSelect;

export type MenuItemOption = typeof menuItemOptions.$inferSelect & {
  choices: MenuItemOptionChoice[];
};

export type MenuItemOptionChoice = typeof menuItemOptionChoices.$inferSelect & {
  ingredients: MenuItemOptionChoiceIngredient[];
};

export type MenuItemOptionChoiceIngredient =
  typeof menuItemOptionChoiceIngredients.$inferSelect;
