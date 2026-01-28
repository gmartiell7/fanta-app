/*
  Warnings:

  - You are about to drop the column `playerId` on the `TeamPlayer` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[teamId,playerExtId]` on the table `TeamPlayer` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `playerExtId` to the `TeamPlayer` table without a default value. This is not possible if the table is not empty.
*/

-- 1) aggiungi la colonna nuova (NULLABLE per non rompere righe esistenti)
ALTER TABLE "TeamPlayer" ADD COLUMN "playerExtId" INTEGER;

-- 2) backfill: prende extId dalla tabella Player tramite playerId (che ESISTE ancora qui)
UPDATE "TeamPlayer" tp
SET "playerExtId" = p."extId"
FROM "Player" p
WHERE tp."playerId" = p."id";

-- 3) se restano NULL, blocca la migration (riferimenti orfani)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "TeamPlayer" WHERE "playerExtId" IS NULL) THEN
    RAISE EXCEPTION 'Backfill playerExtId failed: some rows are NULL (orphan TeamPlayer -> Player)';
  END IF;
END $$;

-- 4) ora possiamo renderla NOT NULL
ALTER TABLE "TeamPlayer" ALTER COLUMN "playerExtId" SET NOT NULL;

-- 5) crea indice e unique (ordine ok: prima index non-unique, poi unique)
CREATE INDEX "TeamPlayer_playerExtId_idx" ON "TeamPlayer"("playerExtId");
CREATE UNIQUE INDEX "TeamPlayer_teamId_playerExtId_key" ON "TeamPlayer"("teamId", "playerExtId");

-- 6) aggiungi FK su Player.extId (UNA volta sola)
ALTER TABLE "TeamPlayer"
ADD CONSTRAINT "TeamPlayer_playerExtId_fkey"
FOREIGN KEY ("playerExtId") REFERENCES "Player"("extId")
ON DELETE CASCADE ON UPDATE CASCADE;

-- 7) ora che playerExtId è pronto, possiamo rimuovere i vecchi vincoli/indici su playerId
ALTER TABLE "TeamPlayer" DROP CONSTRAINT "TeamPlayer_playerId_fkey";
DROP INDEX "TeamPlayer_playerId_idx";
DROP INDEX "TeamPlayer_teamId_playerId_key";

-- 8) infine droppa la colonna vecchia
ALTER TABLE "TeamPlayer" DROP COLUMN "playerId";
