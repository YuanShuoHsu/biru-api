/*
  Warnings:

  - You are about to drop the column `emailVerificationToken` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `emailVerified` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[email_verification_token]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "User_emailVerificationToken_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "emailVerificationToken",
DROP COLUMN "emailVerified",
ADD COLUMN     "email_verification_token" TEXT,
ADD COLUMN     "email_verified" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_verification_token_key" ON "User"("email_verification_token");
