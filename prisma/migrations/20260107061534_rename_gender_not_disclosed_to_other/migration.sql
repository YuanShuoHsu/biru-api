/*
  Warnings:

  - The values [NOT_DISCLOSED] on the enum `Gender` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
CREATE TYPE "Gender_new" AS ENUM ('FEMALE', 'MALE', 'OTHER');
ALTER TABLE "User" ALTER COLUMN "gender" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "gender" TYPE "Gender_new" USING (
  CASE
    WHEN "gender"::text = 'NOT_DISCLOSED' THEN 'OTHER'::"Gender_new"
    ELSE "gender"::text::"Gender_new"
  END
);
ALTER TYPE "Gender" RENAME TO "Gender_old";
ALTER TYPE "Gender_new" RENAME TO "Gender";
DROP TYPE "Gender_old";
ALTER TABLE "User" ALTER COLUMN "gender" SET DEFAULT 'OTHER';
