/*
  Warnings:

  - You are about to drop the column `role` on the `Player` table. All the data in the column will be lost.
  - Added the required column `roleMantra` to the `Player` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Player` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PlayerRoleClassic" AS ENUM ('P', 'D', 'C', 'A');

-- CreateEnum
CREATE TYPE "PlayerRoleMantra" AS ENUM ('Por', 'Ds', 'Dd', 'Dc', 'E', 'M', 'C', 'W', 'T', 'A', 'Pc');

-- DropIndex
DROP INDEX "Player_role_idx";

-- AlterTable
ALTER TABLE "Player" DROP COLUMN "role",
ADD COLUMN     "roleClassic" "PlayerRoleClassic",
ADD COLUMN     "roleMantra" "PlayerRoleMantra" NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- DropEnum
DROP TYPE "PlayerRole";

-- CreateIndex
CREATE INDEX "Player_roleMantra_idx" ON "Player"("roleMantra");

-- CreateIndex
CREATE INDEX "Player_roleClassic_idx" ON "Player"("roleClassic");
