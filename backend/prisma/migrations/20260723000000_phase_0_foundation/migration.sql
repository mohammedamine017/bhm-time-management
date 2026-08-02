-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'RESET');

-- CreateEnum
CREATE TYPE "WorkCodeBehavior" AS ENUM (
  'FIXED_HOURS',
  'ABSENCE',
  'DISPLACEMENT',
  'TIME_CLOCK',
  'HOLIDAY',
  'EMPTY'
);

-- CreateTable
CREATE TABLE "PayrollCycle" (
  "id" TEXT NOT NULL,
  "payrollMonth" TEXT NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "status" "CycleStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "resetAt" TIMESTAMP(3),
  CONSTRAINT "PayrollCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkCode" (
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "behavior" "WorkCodeBehavior" NOT NULL,
  "fixedMinutes" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkCode_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "PayrollCycle_status_idx" ON "PayrollCycle"("status");

-- CreateIndex
CREATE INDEX "PayrollCycle_payrollMonth_idx" ON "PayrollCycle"("payrollMonth");

-- CreateIndex
CREATE INDEX "WorkCode_isActive_sortOrder_idx" ON "WorkCode"("isActive", "sortOrder");

-- SeedData
INSERT INTO "WorkCode" ("code", "label", "behavior", "fixedMinutes", "sortOrder", "updatedAt")
VALUES
  ('P', 'Présence standard', 'FIXED_HOURS', 480, 10, CURRENT_TIMESTAMP),
  ('A', 'Absence', 'ABSENCE', 480, 20, CURRENT_TIMESTAMP),
  ('D', 'Déplacement', 'DISPLACEMENT', NULL, 30, CURRENT_TIMESTAMP),
  ('T', 'Atelier - rapport pointeuse', 'TIME_CLOCK', NULL, 40, CURRENT_TIMESTAMP),
  ('F', 'Jour férié', 'HOLIDAY', NULL, 50, CURRENT_TIMESTAMP),
  ('X', 'Aucune donnée', 'EMPTY', NULL, 60, CURRENT_TIMESTAMP);

