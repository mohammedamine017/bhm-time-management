ALTER TABLE "EmployeeCalculation"
ADD COLUMN "absenceDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "stcDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "paidLeaveDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "sickLeaveDays" INTEGER NOT NULL DEFAULT 0;

UPDATE "EmployeeCalculation"
SET "absenceDays" = CEIL("absenceMinutes" / 480.0)::INTEGER
WHERE "absenceMinutes" > 0;

ALTER TABLE "EmployeeCalculation"
DROP COLUMN "absenceMinutes";

INSERT INTO "WorkCode"
  ("code", "label", "behavior", "fixedMinutes", "sortOrder", "updatedAt")
VALUES
  ('0', 'Absence', 'ABSENCE', NULL, 21, CURRENT_TIMESTAMP),
  ('A', 'Absence', 'ABSENCE', NULL, 20, CURRENT_TIMESTAMP),
  ('X', 'Absence', 'ABSENCE', NULL, 22, CURRENT_TIMESTAMP),
  ('STC', 'Fin de contrat', 'EMPTY', NULL, 30, CURRENT_TIMESTAMP),
  ('MU', 'Mutation vers un autre chantier', 'EMPTY', NULL, 40, CURRENT_TIMESTAMP),
  ('RC', 'Récupération', 'FIXED_HOURS', 480, 50, CURRENT_TIMESTAMP),
  ('CP', 'Congé payé', 'ABSENCE', NULL, 60, CURRENT_TIMESTAMP),
  ('MA', 'Maladie', 'ABSENCE', NULL, 70, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "label" = EXCLUDED."label",
  "behavior" = EXCLUDED."behavior",
  "fixedMinutes" = EXCLUDED."fixedMinutes",
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = CURRENT_TIMESTAMP;
