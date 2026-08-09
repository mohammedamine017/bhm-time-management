-- Un mois de paie ne possède qu'un seul cycle vivant.
-- Les cycles réinitialisés (RESET) conservent leurs documents pour les
-- archives et restent hors de l'index unique.

-- 1. Cycle conservé pour chaque mois: le plus ancien cycle non réinitialisé.
CREATE TEMP TABLE month_keeper AS
SELECT DISTINCT ON ("payrollMonth") "payrollMonth", id AS keeper_id
FROM "PayrollCycle"
WHERE status <> 'RESET'
ORDER BY "payrollMonth", "createdAt", id;

-- 2. Cycles en double à replier sur le cycle conservé.
CREATE TEMP TABLE cycle_merge AS
SELECT c.id AS duplicate_id, k.keeper_id
FROM "PayrollCycle" c
JOIN month_keeper k ON k."payrollMonth" = c."payrollMonth"
WHERE c.status <> 'RESET' AND c.id <> k.keeper_id;

-- 3. Un cycle ne porte qu'un calcul: on garde le plus récent du mois.
CREATE TEMP TABLE run_winner AS
SELECT DISTINCT ON (target) target, id
FROM (
  SELECT COALESCE(m.keeper_id, r."cycleId") AS target, r.id, r."launchedAt"
  FROM "CalculationRun" r
  LEFT JOIN cycle_merge m ON m.duplicate_id = r."cycleId"
) candidates
ORDER BY target, "launchedAt" DESC, id;

DELETE FROM "CalculationRun"
WHERE id NOT IN (SELECT id FROM run_winner);

-- 4. Un rapport de pointeuse est unique par (cycle, checksum).
CREATE TEMP TABLE report_winner AS
SELECT DISTINCT ON (target, checksum) target, checksum, id
FROM (
  SELECT COALESCE(m.keeper_id, t."cycleId") AS target, t.checksum, t.id,
         t."importedAt"
  FROM "TimeClockReport" t
  LEFT JOIN cycle_merge m ON m.duplicate_id = t."cycleId"
) candidates
ORDER BY target, checksum, "importedAt", id;

DELETE FROM "TimeClockReport"
WHERE id NOT IN (SELECT id FROM report_winner);

-- 5. Rattacher les documents survivants au cycle conservé.
UPDATE "ScanBatch" b SET "cycleId" = m.keeper_id
FROM cycle_merge m WHERE b."cycleId" = m.duplicate_id;

UPDATE "TimeClockReport" t SET "cycleId" = m.keeper_id
FROM cycle_merge m WHERE t."cycleId" = m.duplicate_id;

UPDATE "CalculationRun" r SET "cycleId" = m.keeper_id
FROM cycle_merge m WHERE r."cycleId" = m.duplicate_id;

-- 6. Supprimer les doublons, désormais vides.
DELETE FROM "PayrollCycle" c
USING cycle_merge m WHERE c.id = m.duplicate_id;

-- 7. Un cycle non réinitialisé est vivant: COMPLETED n'est plus utilisé.
UPDATE "PayrollCycle"
SET status = 'ACTIVE', "completedAt" = NULL
WHERE status = 'COMPLETED';

-- 8. Garantir l'unicité pour la suite.
CREATE UNIQUE INDEX "PayrollCycle_payrollMonth_live_key"
ON "PayrollCycle" ("payrollMonth")
WHERE status <> 'RESET';
