-- CreateTable
CREATE TABLE "SerieACalendarMatch" (
    "id" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "matchday" INTEGER NOT NULL,
    "date" TIMESTAMP(3),
    "location" TEXT,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SerieACalendarMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SerieACalendarMatch_season_matchday_idx" ON "SerieACalendarMatch"("season", "matchday");

-- CreateIndex
CREATE UNIQUE INDEX "SerieACalendarMatch_season_matchday_homeTeam_awayTeam_key" ON "SerieACalendarMatch"("season", "matchday", "homeTeam", "awayTeam");
