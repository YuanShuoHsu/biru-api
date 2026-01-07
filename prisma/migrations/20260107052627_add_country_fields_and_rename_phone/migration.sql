/*
  Warnings:

  - You are about to drop the column `phone` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[countryCode,phoneNumber]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "User_countryCode_phone_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "phone",
ADD COLUMN     "countryLabel" TEXT NOT NULL DEFAULT 'Taiwan',
ADD COLUMN     "countryPhone" TEXT NOT NULL DEFAULT '+886',
ADD COLUMN     "phoneNumber" TEXT,
ALTER COLUMN "countryCode" SET DEFAULT 'TW';

-- CreateIndex
CREATE UNIQUE INDEX "User_countryCode_phoneNumber_key" ON "User"("countryCode", "phoneNumber");
