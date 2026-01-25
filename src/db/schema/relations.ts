import { relations } from 'drizzle-orm';

import { posts } from './posts';
import { stores, tables } from './stores';
import { account, session, user, verification } from './users';

import {
  menuItemIngredients,
  menuItemOptionChoiceIngredients,
  menuItemOptionChoices,
  menuItemOptions,
  menuItems,
  menus,
} from '../schema';

export const userRelations = relations(user, ({ many }) => ({
  accounts: many(account),
  posts: many(posts),
  sessions: many(session),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const verificationRelations = relations(verification, () => ({}));

export const postRelations = relations(posts, ({ one }) => ({
  author: one(user, {
    fields: [posts.authorId],
    references: [user.id],
  }),
}));

export const storeRelations = relations(stores, ({ many }) => ({
  menus: many(menus),
  tables: many(tables),
}));

export const menuRelations = relations(menus, ({ one, many }) => ({
  store: one(stores, {
    fields: [menus.storeId],
    references: [stores.id],
  }),
  items: many(menuItems),
}));

export const tableRelations = relations(tables, ({ one }) => ({
  store: one(stores, {
    fields: [tables.storeId],
    references: [stores.id],
  }),
}));

export const menuItemRelations = relations(menuItems, ({ one, many }) => ({
  menu: one(menus, {
    fields: [menuItems.menuId],
    references: [menus.id],
  }),
  options: many(menuItemOptions),
  ingredients: many(menuItemIngredients),
}));

export const menuItemOptionRelations = relations(
  menuItemOptions,
  ({ one, many }) => ({
    menuItem: one(menuItems, {
      fields: [menuItemOptions.menuItemId],
      references: [menuItems.id],
    }),
    choices: many(menuItemOptionChoices),
  }),
);

export const menuItemIngredientRelations = relations(
  menuItemIngredients,
  ({ one }) => ({
    menuItem: one(menuItems, {
      fields: [menuItemIngredients.menuItemId],
      references: [menuItems.id],
    }),
  }),
);

export const menuItemOptionChoiceRelations = relations(
  menuItemOptionChoices,
  ({ one, many }) => ({
    menuItemOption: one(menuItemOptions, {
      fields: [menuItemOptionChoices.menuItemOptionId],
      references: [menuItemOptions.id],
    }),
    ingredients: many(menuItemOptionChoiceIngredients),
  }),
);

export const menuItemOptionChoiceIngredientRelations = relations(
  menuItemOptionChoiceIngredients,
  ({ one }) => ({
    menuItemOptionChoice: one(menuItemOptionChoices, {
      fields: [menuItemOptionChoiceIngredients.menuItemOptionChoiceId],
      references: [menuItemOptionChoices.id],
    }),
  }),
);
