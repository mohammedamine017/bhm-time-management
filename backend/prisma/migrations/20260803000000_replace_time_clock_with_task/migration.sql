ALTER TYPE "WorkCodeBehavior" RENAME VALUE 'TIME_CLOCK' TO 'TASK';

UPDATE "WorkCode"
SET "label" = 'Travail à la tâche'
WHERE "code" = 'T';

DROP TABLE IF EXISTS "TimeClockReport";

DROP INDEX IF EXISTS "ExtractedTimeSheetRow_hasTimeClockCode_idx";

ALTER TABLE "ExtractedTimeSheetRow"
DROP COLUMN IF EXISTS "hasTimeClockCode";

ALTER TABLE "EmployeeCalculation"
ADD COLUMN "taskDays" INTEGER NOT NULL DEFAULT 0;
