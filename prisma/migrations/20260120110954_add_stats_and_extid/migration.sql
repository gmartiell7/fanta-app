/*
  Warnings:

  - A unique constraint covering the columns `[extId]` on the table `Player` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "MatchdayStat" ADD COLUMN     "rs" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "team" TEXT;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "extId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Player_extId_key" ON "Player"("extId");
