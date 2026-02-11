-- CreateEnum
CREATE TYPE "PlayerGroup" AS ENUM ('TOP', 'SEMITOP', 'JOLLY', 'OTTIMO_TITOLARE', 'BUON_TITOLARE', 'DA_VOTO', 'EVITABILE');

-- CreateEnum
CREATE TYPE "CertaintyLevel" AS ENUM ('NONE', 'PROBABLE', 'SURE');

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "calciPiazzati" "CertaintyLevel" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "group" "PlayerGroup",
ADD COLUMN     "possibleSpend" INTEGER,
ADD COLUMN     "rigorista" "CertaintyLevel" NOT NULL DEFAULT 'NONE';

-- CreateIndex
CREATE INDEX "Player_group_idx" ON "Player"("group");

-- CreateIndex
CREATE INDEX "Player_rigorista_idx" ON "Player"("rigorista");

-- CreateIndex
CREATE INDEX "Player_calciPiazzati_idx" ON "Player"("calciPiazzati");
