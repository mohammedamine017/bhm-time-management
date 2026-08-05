-- Store imported time-clock files independently from scanned work sheets.
CREATE TABLE "TimeClockReport" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageUrl" TEXT,
    "storageKey" TEXT,
    "checksum" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimeClockReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TimeClockReportEmployee" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "employeeId" TEXT,
    "sourceEmployeeNumber" TEXT,
    "sourceFullName" TEXT NOT NULL,
    "days" JSONB NOT NULL,
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "TimeClockReportEmployee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TimeClockReport_cycleId_checksum_key"
ON "TimeClockReport"("cycleId", "checksum");
CREATE INDEX "TimeClockReport_cycleId_importedAt_idx"
ON "TimeClockReport"("cycleId", "importedAt");
CREATE UNIQUE INDEX "TimeClockReportEmployee_reportId_sourceFullName_key"
ON "TimeClockReportEmployee"("reportId", "sourceFullName");
CREATE INDEX "TimeClockReportEmployee_employeeId_idx"
ON "TimeClockReportEmployee"("employeeId");

ALTER TABLE "TimeClockReport"
ADD CONSTRAINT "TimeClockReport_cycleId_fkey"
FOREIGN KEY ("cycleId") REFERENCES "PayrollCycle"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TimeClockReportEmployee"
ADD CONSTRAINT "TimeClockReportEmployee_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "TimeClockReport"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TimeClockReportEmployee"
ADD CONSTRAINT "TimeClockReportEmployee_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EmployeeCalculation"
RENAME COLUMN "absenceDays" TO "absenceMinutes";

UPDATE "EmployeeCalculation"
SET "absenceMinutes" = "absenceMinutes" * 480;
