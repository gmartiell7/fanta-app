-- CreateEnum
CREATE TYPE "GameMode" AS ENUM ('MANTRA', 'CLASSIC');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "gameMode" "GameMode" NOT NULL DEFAULT 'MANTRA';

-- AddForeignKey
ALTER TABLE "FreeAgentNote" ADD CONSTRAINT "FreeAgentNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
