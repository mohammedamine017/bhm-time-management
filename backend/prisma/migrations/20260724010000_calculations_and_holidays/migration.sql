CREATE TYPE "CalculationRunStatus" AS ENUM ('COMPLETED');

CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CalculationRun" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "status" "CalculationRunStatus" NOT NULL DEFAULT 'COMPLETED',
    "openDays" INTEGER NOT NULL,
    "adjustmentMinutes" INTEGER NOT NULL,
    "launchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CalculationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmployeeCalculation" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "normalMinutes" INTEGER NOT NULL DEFAULT 0,
    "absenceMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMiniMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMaxiMinutes" INTEGER NOT NULL DEFAULT 0,
    "displacementDays" INTEGER NOT NULL DEFAULT 0,
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "warnings" JSONB NOT NULL,
    "details" JSONB NOT NULL,
    CONSTRAINT "EmployeeCalculation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");
CREATE INDEX "Holiday_date_idx" ON "Holiday"("date");
CREATE UNIQUE INDEX "CalculationRun_cycleId_key" ON "CalculationRun"("cycleId");
CREATE UNIQUE INDEX "EmployeeCalculation_runId_employeeId_key"
ON "EmployeeCalculation"("runId", "employeeId");
CREATE INDEX "EmployeeCalculation_employeeId_idx"
ON "EmployeeCalculation"("employeeId");
CREATE INDEX "EmployeeCalculation_requiresReview_idx"
ON "EmployeeCalculation"("requiresReview");

ALTER TABLE "CalculationRun" ADD CONSTRAINT "CalculationRun_cycleId_fkey"
FOREIGN KEY ("cycleId") REFERENCES "PayrollCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeCalculation" ADD CONSTRAINT "EmployeeCalculation_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "CalculationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeCalculation" ADD CONSTRAINT "EmployeeCalculation_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
