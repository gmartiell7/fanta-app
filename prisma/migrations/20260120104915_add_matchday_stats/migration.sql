-- CreateTable
CREATE TABLE "MatchdayStat" (
    "id" TEXT NOT NULL,
    "matchday" INTEGER NOT NULL,
    "playerId" TEXT NOT NULL,
    "voteRaw" TEXT,
    "vote" DOUBLE PRECISION,
    "gf" INTEGER NOT NULL DEFAULT 0,
    "gs" INTEGER NOT NULL DEFAULT 0,
    "rp" INTEGER NOT NULL DEFAULT 0,
    "rf" INTEGER NOT NULL DEFAULT 0,
    "au" INTEGER NOT NULL DEFAULT 0,
    "amm" INTEGER NOT NULL DEFAULT 0,
    "esp" INTEGER NOT NULL DEFAULT 0,
    "ass" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchdayStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchdayStat_matchday_idx" ON "MatchdayStat"("matchday");

-- CreateIndex
CREATE UNIQUE INDEX "MatchdayStat_playerId_matchday_key" ON "MatchdayStat"("playerId", "matchday");

-- AddForeignKey
ALTER TABLE "MatchdayStat" ADD CONSTRAINT "MatchdayStat_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
