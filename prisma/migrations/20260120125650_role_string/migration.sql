/*
  Warnings:

  - The `roleClassic` column on the `Player` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `roleMantra` on the `Player` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "Player" DROP COLUMN "roleClassic",
ADD COLUMN     "roleClassic" TEXT,
DROP COLUMN "roleMantra",
ADD COLUMN     "roleMantra" TEXT NOT NULL;

-- DropEnum
DROP TYPE "PlayerRoleClassic";

-- DropEnum
DROP TYPE "PlayerRoleMantra";

-- CreateIndex
CREATE INDEX "Player_roleMantra_idx" ON "Player"("roleMantra");

-- CreateIndex
CREATE INDEX "Player_roleClassic_idx" ON "Player"("roleClassic");
