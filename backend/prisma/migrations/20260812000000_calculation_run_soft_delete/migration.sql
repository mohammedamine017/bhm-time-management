-- Un calcul supprimé quitte l'historique et rejoint la corbeille.
ALTER TABLE "CalculationRun" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "CalculationRun_deletedAt_idx" ON "CalculationRun"("deletedAt");
