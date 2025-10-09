-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('admin', 'manager', 'staff', 'user');

-- CreateTable
CREATE TABLE "public"."Menu" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "storeId" TEXT NOT NULL,

    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MenuItem" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
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

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MenuItemOption" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "menuItemId" TEXT NOT NULL,

    CONSTRAINT "MenuItemOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MenuItemIngredient" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unit" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "usage" DECIMAL(10,3) NOT NULL,
    "menuItemId" TEXT NOT NULL,

    CONSTRAINT "MenuItemIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MenuItemOptionChoice" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extraCost" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "stock" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "menuItemOptionId" TEXT NOT NULL,

    CONSTRAINT "MenuItemOptionChoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MenuItemOptionChoiceIngredient" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unit" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "usage" DECIMAL(10,3) NOT NULL,
    "menuItemOptionChoiceId" TEXT NOT NULL,

    CONSTRAINT "MenuItemOptionChoiceIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Post" (
    "id" SERIAL NOT NULL,
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published" BOOLEAN DEFAULT false,
    "title" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" INTEGER,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Store" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "slug" VARCHAR(64) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Table" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "slug" VARCHAR(64) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "storeId" TEXT NOT NULL,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL DEFAULT 'user',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Menu_storeId_idx" ON "public"."Menu"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Menu_storeId_key_key" ON "public"."Menu"("storeId", "key");

-- CreateIndex
CREATE INDEX "MenuItem_menuId_idx" ON "public"."MenuItem"("menuId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_menuId_key_key" ON "public"."MenuItem"("menuId", "key");

-- CreateIndex
CREATE INDEX "MenuItemOption_menuItemId_idx" ON "public"."MenuItemOption"("menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemOption_menuItemId_key_key" ON "public"."MenuItemOption"("menuItemId", "key");

-- CreateIndex
CREATE INDEX "MenuItemIngredient_menuItemId_idx" ON "public"."MenuItemIngredient"("menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemIngredient_menuItemId_key_key" ON "public"."MenuItemIngredient"("menuItemId", "key");

-- CreateIndex
CREATE INDEX "MenuItemOptionChoice_menuItemOptionId_idx" ON "public"."MenuItemOptionChoice"("menuItemOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemOptionChoice_menuItemOptionId_key_key" ON "public"."MenuItemOptionChoice"("menuItemOptionId", "key");

-- CreateIndex
CREATE INDEX "MenuItemOptionChoiceIngredient_menuItemOptionChoiceId_idx" ON "public"."MenuItemOptionChoiceIngredient"("menuItemOptionChoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItemOptionChoiceIngredient_menuItemOptionChoiceId_key_key" ON "public"."MenuItemOptionChoiceIngredient"("menuItemOptionChoiceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Store_slug_key" ON "public"."Store"("slug");

-- CreateIndex
CREATE INDEX "Table_storeId_idx" ON "public"."Table"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Table_storeId_slug_key" ON "public"."Table"("storeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- AddForeignKey
ALTER TABLE "public"."Menu" ADD CONSTRAINT "Menu_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MenuItem" ADD CONSTRAINT "MenuItem_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "public"."Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MenuItemOption" ADD CONSTRAINT "MenuItemOption_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "public"."MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MenuItemIngredient" ADD CONSTRAINT "MenuItemIngredient_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "public"."MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MenuItemOptionChoice" ADD CONSTRAINT "MenuItemOptionChoice_menuItemOptionId_fkey" FOREIGN KEY ("menuItemOptionId") REFERENCES "public"."MenuItemOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MenuItemOptionChoiceIngredient" ADD CONSTRAINT "MenuItemOptionChoiceIngredient_menuItemOptionChoiceId_fkey" FOREIGN KEY ("menuItemOptionChoiceId") REFERENCES "public"."MenuItemOptionChoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Table" ADD CONSTRAINT "Table_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
