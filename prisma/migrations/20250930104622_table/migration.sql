/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `Store` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `slug` to the `Store` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Choice" ALTER COLUMN "name" SET DEFAULT '{}';

-- AlterTable
ALTER TABLE "public"."Menu" ALTER COLUMN "name" SET DEFAULT '{}';

-- AlterTable
ALTER TABLE "public"."MenuItem" ALTER COLUMN "name" SET DEFAULT '{}',
ALTER COLUMN "description" SET DEFAULT '{}';

-- AlterTable
ALTER TABLE "public"."Option" ALTER COLUMN "name" SET DEFAULT '{}';

-- AlterTable
ALTER TABLE "public"."RecipeItem" ALTER COLUMN "name" SET DEFAULT '{}',
ALTER COLUMN "unit" SET DEFAULT '{}';

-- AlterTable
ALTER TABLE "public"."Store" ADD COLUMN     "slug" TEXT NOT NULL,
ALTER COLUMN "name" SET DEFAULT '{}';

-- CreateTable
CREATE TABLE "public"."Table" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "slug" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "storeId" TEXT NOT NULL,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Table_storeId_idx" ON "public"."Table"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Table_storeId_slug_key" ON "public"."Table"("storeId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Store_slug_key" ON "public"."Store"("slug");

-- AddForeignKey
ALTER TABLE "public"."Table" ADD CONSTRAINT "Table_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "public"."Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
