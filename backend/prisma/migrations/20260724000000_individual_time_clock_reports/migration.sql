CREATE TABLE "TimeClockReport" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageUrl" TEXT,
    "storageKey" TEXT,
    "days" JSONB NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimeClockReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TimeClockReport_cycleId_employeeId_key"
ON "TimeClockReport"("cycleId", "employeeId");
CREATE INDEX "TimeClockReport_cycleId_importedAt_idx"
ON "TimeClockReport"("cycleId", "importedAt");
CREATE INDEX "TimeClockReport_employeeId_idx"
ON "TimeClockReport"("employeeId");

ALTER TABLE "TimeClockReport" ADD CONSTRAINT "TimeClockReport_cycleId_fkey"
FOREIGN KEY ("cycleId") REFERENCES "PayrollCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeClockReport" ADD CONSTRAINT "TimeClockReport_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
