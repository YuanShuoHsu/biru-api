-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('LOCAL', 'GOOGLE');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'OTHER');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'STAFF', 'USER');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "accessToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idToken" TEXT,
    "password" TEXT,
    "provider_account_id" "Provider" NOT NULL DEFAULT 'LOCAL',
    "refreshToken" TEXT,
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menus" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "storeId" TEXT NOT NULL,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" JSONB NOT NULL DEFAULT '{}',
    "imageUrl" TEXT NOT NULL DEFAULT '/images/IMG_4590.jpg',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "price" INTEGER NOT NULL,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "stock" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "menuId" TEXT NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_options" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "menuItemId" TEXT NOT NULL,

    CONSTRAINT "menu_item_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_ingredients" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unit" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "usage" DOUBLE PRECISION NOT NULL,
    "menuItemId" TEXT NOT NULL,

    CONSTRAINT "menu_item_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_option_choices" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extraCost" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "stock" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "menuItemOptionId" TEXT NOT NULL,

    CONSTRAINT "menu_item_option_choices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_option_choice_ingredients" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unit" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "usage" DOUBLE PRECISION NOT NULL,
    "menuItemOptionChoiceId" TEXT NOT NULL,

    CONSTRAINT "menu_item_option_choice_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" SERIAL NOT NULL,
    "author_id" TEXT NOT NULL,
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "token" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL DEFAULT '{}',
    "address" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "slug" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tables" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "slug" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "countryCode" TEXT NOT NULL DEFAULT 'TW',
    "countryLabel" TEXT NOT NULL DEFAULT 'Taiwan',
    "countryPhone" TEXT NOT NULL DEFAULT '+886',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "email_verified" TIMESTAMP(3),
    "firstName" TEXT NOT NULL DEFAULT '',
    "gender" "Gender" NOT NULL DEFAULT 'OTHER',
    "image" TEXT,
    "isSubscribed" BOOLEAN NOT NULL DEFAULT true,
    "lastName" TEXT NOT NULL DEFAULT '',
    "phoneNumber" TEXT,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "identifier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_account_id_accountId_key" ON "accounts"("provider_account_id", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_user_id_provider_account_id_key" ON "accounts"("user_id", "provider_account_id");

-- CreateIndex
CREATE INDEX "menus_storeId_idx" ON "menus"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "menus_storeId_key_key" ON "menus"("storeId", "key");

-- CreateIndex
CREATE INDEX "menu_items_menuId_idx" ON "menu_items"("menuId");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_menuId_key_key" ON "menu_items"("menuId", "key");

-- CreateIndex
CREATE INDEX "menu_item_options_menuItemId_idx" ON "menu_item_options"("menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_options_menuItemId_key_key" ON "menu_item_options"("menuItemId", "key");

-- CreateIndex
CREATE INDEX "menu_item_ingredients_menuItemId_idx" ON "menu_item_ingredients"("menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_ingredients_menuItemId_key_key" ON "menu_item_ingredients"("menuItemId", "key");

-- CreateIndex
CREATE INDEX "menu_item_option_choices_menuItemOptionId_idx" ON "menu_item_option_choices"("menuItemOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_option_choices_menuItemOptionId_key_key" ON "menu_item_option_choices"("menuItemOptionId", "key");

-- CreateIndex
CREATE INDEX "menu_item_option_choice_ingredients_menuItemOptionChoiceId_idx" ON "menu_item_option_choice_ingredients"("menuItemOptionChoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_option_choice_ingredients_menuItemOptionChoiceId__key" ON "menu_item_option_choice_ingredients"("menuItemOptionChoiceId", "key");

-- CreateIndex
CREATE INDEX "posts_author_id_idx" ON "posts"("author_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_user_id_userAgent_key" ON "sessions"("user_id", "userAgent");

-- CreateIndex
CREATE UNIQUE INDEX "stores_slug_key" ON "stores"("slug");

-- CreateIndex
CREATE INDEX "tables_store_id_idx" ON "tables"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "tables_store_id_slug_key" ON "tables"("store_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_countryCode_phoneNumber_key" ON "users"("countryCode", "phoneNumber");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_options" ADD CONSTRAINT "menu_item_options_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_option_choices" ADD CONSTRAINT "menu_item_option_choices_menuItemOptionId_fkey" FOREIGN KEY ("menuItemOptionId") REFERENCES "menu_item_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_option_choice_ingredients" ADD CONSTRAINT "menu_item_option_choice_ingredients_menuItemOptionChoiceId_fkey" FOREIGN KEY ("menuItemOptionChoiceId") REFERENCES "menu_item_option_choices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
