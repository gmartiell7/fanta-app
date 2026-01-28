/*
  Warnings:

  - Added the required column `updatedAt` to the `MatchdayStat` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `role` on the `Player` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Made the column `price` on table `Player` required. This step will fail if there are existing NULL values in that column.
  - Made the column `extId` on table `Player` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "PlayerRole" AS ENUM ('POR', 'DIF', 'CEN', 'ATT');

-- DropIndex
DROP INDEX "Player_name_team_key";

-- AlterTable
ALTER TABLE "MatchdayStat" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Player" DROP COLUMN "role",
ADD COLUMN     "role" "PlayerRole" NOT NULL,
ALTER COLUMN "price" SET NOT NULL,
ALTER COLUMN "price" SET DEFAULT 0,
ALTER COLUMN "extId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "MatchdayStat_playerId_idx" ON "MatchdayStat"("playerId");

-- CreateIndex
CREATE INDEX "Player_role_idx" ON "Player"("role");

-- CreateIndex
CREATE INDEX "Player_team_idx" ON "Player"("team");

-- CreateIndex
CREATE INDEX "TeamPlayer_teamId_idx" ON "TeamPlayer"("teamId");
