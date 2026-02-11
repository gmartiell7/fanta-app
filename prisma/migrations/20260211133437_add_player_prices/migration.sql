/*
  Warnings:

  - You are about to drop the column `price` on the `Player` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Player" DROP COLUMN "price",
ADD COLUMN     "priceClassic" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "priceMantra" INTEGER NOT NULL DEFAULT 0;
