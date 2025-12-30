/*
  Warnings:

  - You are about to alter the column `usage` on the `MenuItemIngredient` table. The data in that column could be lost. The data in that column will be cast from `Decimal(10,3)` to `DoublePrecision`.
  - You are about to alter the column `usage` on the `MenuItemOptionChoiceIngredient` table. The data in that column could be lost. The data in that column will be cast from `Decimal(10,3)` to `DoublePrecision`.
  - You are about to drop the column `email_verification_token` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[emailVerificationToken]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "User_email_verification_token_key";

-- AlterTable
ALTER TABLE "MenuItemIngredient" ALTER COLUMN "usage" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "MenuItemOptionChoiceIngredient" ALTER COLUMN "usage" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "email_verification_token",
ADD COLUMN     "emailVerificationToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_emailVerificationToken_key" ON "User"("emailVerificationToken");
