/*
  Warnings:

  - You are about to drop the column `verificationToken` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[emailVerificationToken]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "User_verificationToken_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "verificationToken",
ADD COLUMN     "emailVerificationToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_emailVerificationToken_key" ON "User"("emailVerificationToken");
