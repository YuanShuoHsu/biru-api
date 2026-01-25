import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  json,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

// Enums
export const providerEnum = pgEnum('Provider', ['LOCAL', 'GOOGLE']);
export const genderEnum = pgEnum('Gender', ['FEMALE', 'MALE', 'OTHER']);
export const roleEnum = pgEnum('Role', ['ADMIN', 'MANAGER', 'STAFF', 'USER']);

// Tables

export const users = pgTable(
  'users',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    birthDate: timestamp('birthDate', { mode: 'date' }),
    countryCode: text('countryCode').default('TW').notNull(),
    countryLabel: text('countryLabel').default('Taiwan').notNull(),
    countryPhone: text('countryPhone').default('+886').notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    email: text('email').unique().notNull(),
    emailVerified: timestamp('email_verified', { mode: 'date' }),
    firstName: text('firstName').default('').notNull(),
    gender: genderEnum('gender').default('OTHER').notNull(),
    image: text('image'),
    isSubscribed: boolean('isSubscribed').default(true).notNull(),
    lastName: text('lastName').default('').notNull(),
    phoneNumber: text('phoneNumber'),
    phoneVerified: boolean('phoneVerified').default(false).notNull(),
    role: roleEnum('role').default('USER').notNull(),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => {
    return {
      countryPhoneUnique: unique().on(table.countryCode, table.phoneNumber),
    };
  },
);

export const userRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  posts: many(posts),
  sessions: many(sessions),
}));

export const accounts = pgTable(
  'accounts',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    accessToken: text('accessToken'),
    accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { mode: 'date' }),
    accountId: text('accountId').notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    idToken: text('idToken'),
    password: text('password'),
    providerAccountId: providerEnum('provider_account_id')
      .default('LOCAL')
      .notNull(),
    refreshToken: text('refreshToken'),
    refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { mode: 'date' }),
    scope: text('scope'),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => {
    return {
      providerAccountIdUnique: unique().on(
        table.providerAccountId,
        table.accountId,
      ),
      userIdProviderUnique: unique().on(table.userId, table.providerAccountId),
      userIdIdx: index('accounts_user_id_idx').on(table.userId),
    };
  },
);

export const accountRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const sessions = pgTable(
  'sessions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    expiresAt: timestamp('expiresAt', { mode: 'date' }).notNull(),
    ipAddress: text('ipAddress'),
    token: text('token').unique().notNull(),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    userAgent: text('userAgent'),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => {
    return {
      userUserAgentUnique: unique().on(table.userId, table.userAgent),
      userIdIdx: index('sessions_user_id_idx').on(table.userId),
    };
  },
);

export const sessionRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const posts = pgTable(
  'posts',
  {
    id: serial('id').primaryKey(),
    authorId: text('author_id')
      .notNull()
      .references(() => users.id),
    content: text('content'),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    published: boolean('published').default(false).notNull(),
    title: text('title').notNull(),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => {
    return {
      authorIdIdx: index('posts_author_id_idx').on(table.authorId),
    };
  },
);

export const postRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
}));

export const verifications = pgTable(
  'verifications',
  {
    identifier: text('identifier').notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    expiresAt: timestamp('expiresAt', { mode: 'date' }).notNull(),
    token: text('token').notNull(),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => {
    return {
      compositeKey: primaryKey({ columns: [table.identifier, table.token] }),
    };
  },
);

export const stores = pgTable('stores', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: json('name').default({}).notNull(),
  address: text('address').default('').notNull(),
  createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
  isActive: boolean('isActive').default(true).notNull(),
  slug: text('slug').unique().notNull(),
  updatedAt: timestamp('updatedAt', { mode: 'date' })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export const storeRelations = relations(stores, ({ many }) => ({
  menus: many(menus),
  tables: many(tables),
}));

export const menus = pgTable(
  'menus',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text('key').notNull(),
    name: json('name').default({}).notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    isActive: boolean('isActive').default(true).notNull(),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    storeId: text('storeId')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
  },
  (table) => {
    return {
      storeIdKeyUnique: unique().on(table.storeId, table.key),
      storeIdIdx: index('menus_storeId_idx').on(table.storeId),
    };
  },
);

export const menuRelations = relations(menus, ({ one, many }) => ({
  store: one(stores, {
    fields: [menus.storeId],
    references: [stores.id],
  }),
  items: many(menuItems),
}));

export const tables = pgTable(
  'tables',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: json('name').default({}).notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    isActive: boolean('isActive').default(true).notNull(),
    slug: text('slug').notNull(),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => {
    return {
      storeIdSlugUnique: unique().on(table.storeId, table.slug),
      storeIdIdx: index('tables_store_id_idx').on(table.storeId),
    };
  },
);

export const tableRelations = relations(tables, ({ one }) => ({
  store: one(stores, {
    fields: [tables.storeId],
    references: [stores.id],
  }),
}));

export const menuItems = pgTable(
  'menu_items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text('key').notNull(),
    name: json('name').default({}).notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    description: json('description').default({}).notNull(),
    imageUrl: text('imageUrl').default('/images/IMG_4590.jpg').notNull(),
    isActive: boolean('isActive').default(true).notNull(),
    price: integer('price').notNull(),
    sold: integer('sold').default(0).notNull(),
    stock: integer('stock'),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    menuId: text('menuId')
      .notNull()
      .references(() => menus.id, { onDelete: 'cascade' }),
  },
  (table) => {
    return {
      menuIdKeyUnique: unique().on(table.menuId, table.key),
      menuIdIdx: index('menu_items_menuId_idx').on(table.menuId),
    };
  },
);

export const menuItemRelations = relations(menuItems, ({ one, many }) => ({
  menu: one(menus, {
    fields: [menuItems.menuId],
    references: [menus.id],
  }),
  options: many(menuItemOptions),
  ingredients: many(menuItemIngredients),
}));

export const menuItemOptions = pgTable(
  'menu_item_options',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text('key').notNull(),
    name: json('name').default({}).notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    isActive: boolean('isActive').default(true).notNull(),
    multiple: boolean('multiple').default(false).notNull(),
    required: boolean('required').default(false).notNull(),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    menuItemId: text('menuItemId')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
  },
  (table) => {
    return {
      menuItemIdKeyUnique: unique().on(table.menuItemId, table.key),
      menuItemIdIdx: index('menu_item_options_menuItemId_idx').on(
        table.menuItemId,
      ),
    };
  },
);

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

export const menuItemIngredients = pgTable(
  'menu_item_ingredients',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text('key').notNull(),
    name: json('name').default({}).notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    unit: json('unit').default({}).notNull(),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    usage: doublePrecision('usage').notNull(),
    menuItemId: text('menuItemId')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
  },
  (table) => {
    return {
      menuItemIdKeyUnique: unique().on(table.menuItemId, table.key),
      menuItemIdIdx: index('menu_item_ingredients_menuItemId_idx').on(
        table.menuItemId,
      ),
    };
  },
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

export const menuItemOptionChoices = pgTable(
  'menu_item_option_choices',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text('key').notNull(),
    name: json('name').default({}).notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    extraCost: integer('extraCost').default(0).notNull(),
    isActive: boolean('isActive').default(true).notNull(),
    isShared: boolean('isShared').default(false).notNull(),
    sold: integer('sold').default(0).notNull(),
    stock: integer('stock'),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    menuItemOptionId: text('menuItemOptionId')
      .notNull()
      .references(() => menuItemOptions.id, { onDelete: 'cascade' }),
  },
  (table) => {
    return {
      menuItemOptionIdKeyUnique: unique().on(table.menuItemOptionId, table.key),
      menuItemOptionIdIdx: index('menu_item_option_id_idx').on(
        table.menuItemOptionId,
      ),
    };
  },
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

export const menuItemOptionChoiceIngredients = pgTable(
  'menu_item_option_choice_ingredients',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text('key').notNull(),
    name: json('name').default({}).notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    unit: json('unit').default({}).notNull(),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    usage: doublePrecision('usage').notNull(),
    menuItemOptionChoiceId: text('menuItemOptionChoiceId')
      .notNull()
      .references(() => menuItemOptionChoices.id, { onDelete: 'cascade' }),
  },
  (table) => {
    return {
      menuItemOptionChoiceIdKeyUnique: unique().on(
        table.menuItemOptionChoiceId,
        table.key,
      ),
      menuItemOptionChoiceIdIdx: index(
        'menu_item_option_choice_ingredients_menuItemOptionChoiceId',
      ).on(table.menuItemOptionChoiceId),
    };
  },
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
