-- CreateTable
CREATE TABLE "FreeAgentNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "playerKey" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreeAgentNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FreeAgentNote_userId_idx" ON "FreeAgentNote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FreeAgentNote_userId_playerKey_key" ON "FreeAgentNote"("userId", "playerKey");
