-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('admin', 'manager', 'staff', 'user');

-- CreateTable
CREATE TABLE "public"."Menu" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "storeId" TEXT NOT NULL,

    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MenuItem" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" JSONB NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "price" INTEGER NOT NULL,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "stock" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "menuId" TEXT NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Option" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Option_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Choice" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "optionId" TEXT NOT NULL,

    CONSTRAINT "Choice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MenuItemOption" (
    "menuItemId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "required" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MenuItemOption_pkey" PRIMARY KEY ("menuItemId","optionId")
);

-- CreateTable
CREATE TABLE "public"."MenuItemChoice" (
    "menuItemId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "choiceId" TEXT NOT NULL,
    "extraCost" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "sold" INTEGER NOT NULL DEFAULT 0,
    "stock" INTEGER,

    CONSTRAINT "MenuItemChoice_pkey" PRIMARY KEY ("menuItemId","optionId","choiceId")
);

-- CreateTable
CREATE TABLE "public"."RecipeItem" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unit" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecipeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MenuItemRecipe" (
    "usage" DOUBLE PRECISION NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "recipeItemId" TEXT NOT NULL,

    CONSTRAINT "MenuItemRecipe_pkey" PRIMARY KEY ("menuItemId","recipeItemId")
);

-- CreateTable
CREATE TABLE "public"."ChoiceRecipe" (
    "usage" DOUBLE PRECISION NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "choiceId" TEXT NOT NULL,
    "recipeItemId" TEXT NOT NULL,

    CONSTRAINT "ChoiceRecipe_pkey" PRIMARY KEY ("menuItemId","optionId","choiceId","recipeItemId")
);

-- CreateTable
CREATE TABLE "public"."Post" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "published" BOOLEAN DEFAULT false,
    "authorId" INTEGER,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Store" (
    "id" TEXT NOT NULL,
    "name" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "MenuItem_menuId_idx" ON "public"."MenuItem"("menuId");

-- CreateIndex
CREATE INDEX "Choice_optionId_idx" ON "public"."Choice"("optionId");

-- CreateIndex
CREATE INDEX "MenuItemOption_optionId_idx" ON "public"."MenuItemOption"("optionId");

-- CreateIndex
CREATE INDEX "MenuItemChoice_choiceId_idx" ON "public"."MenuItemChoice"("choiceId");

-- CreateIndex
CREATE INDEX "MenuItemRecipe_recipeItemId_idx" ON "public"."MenuItemRecipe"("recipeItemId");

-- CreateIndex
CREATE INDEX "ChoiceRecipe_recipeItemId_idx" ON "public"."ChoiceRecipe"("recipeItemId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- AddForeignKey
ALTER TABLE "public"."Menu" ADD CONSTRAINT "Menu_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MenuItem" ADD CONSTRAINT "MenuItem_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "public"."Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Choice" ADD CONSTRAINT "Choice_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "public"."Option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MenuItemOption" ADD CONSTRAINT "MenuItemOption_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "public"."MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MenuItemOption" ADD CONSTRAINT "MenuItemOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "public"."Option"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MenuItemChoice" ADD CONSTRAINT "MenuItemChoice_menuItemId_optionId_fkey" FOREIGN KEY ("menuItemId", "optionId") REFERENCES "public"."MenuItemOption"("menuItemId", "optionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MenuItemChoice" ADD CONSTRAINT "MenuItemChoice_choiceId_fkey" FOREIGN KEY ("choiceId") REFERENCES "public"."Choice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MenuItemRecipe" ADD CONSTRAINT "MenuItemRecipe_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "public"."MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MenuItemRecipe" ADD CONSTRAINT "MenuItemRecipe_recipeItemId_fkey" FOREIGN KEY ("recipeItemId") REFERENCES "public"."RecipeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChoiceRecipe" ADD CONSTRAINT "ChoiceRecipe_menuItemId_optionId_choiceId_fkey" FOREIGN KEY ("menuItemId", "optionId", "choiceId") REFERENCES "public"."MenuItemChoice"("menuItemId", "optionId", "choiceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChoiceRecipe" ADD CONSTRAINT "ChoiceRecipe_recipeItemId_fkey" FOREIGN KEY ("recipeItemId") REFERENCES "public"."RecipeItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
