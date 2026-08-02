CREATE TYPE "ScanBatchStatus" AS ENUM ('PROCESSING', 'EXTRACTED', 'FAILED');
CREATE TYPE "ScanDocumentStatus" AS ENUM ('PENDING', 'PROCESSING', 'EXTRACTED', 'FAILED');

CREATE TABLE "ScanBatch" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "status" "ScanBatchStatus" NOT NULL DEFAULT 'PROCESSING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extractedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    CONSTRAINT "ScanBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScanDocument" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageUrl" TEXT,
    "storageKey" TEXT,
    "status" "ScanDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extractedAt" TIMESTAMP(3),
    CONSTRAINT "ScanDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExtractedTimeSheetRow" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "employeeId" TEXT,
    "extractedFullName" TEXT NOT NULL,
    "matchedFullName" TEXT,
    "sourceRowLabel" TEXT,
    "days" JSONB NOT NULL,
    "hasTimeClockCode" BOOLEAN NOT NULL DEFAULT false,
    "requiresReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExtractedTimeSheetRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScanBatch_cycleId_createdAt_idx" ON "ScanBatch"("cycleId", "createdAt");
CREATE INDEX "ScanBatch_status_idx" ON "ScanBatch"("status");
CREATE INDEX "ScanDocument_batchId_idx" ON "ScanDocument"("batchId");
CREATE INDEX "ScanDocument_status_idx" ON "ScanDocument"("status");
CREATE INDEX "ExtractedTimeSheetRow_documentId_idx" ON "ExtractedTimeSheetRow"("documentId");
CREATE INDEX "ExtractedTimeSheetRow_employeeId_idx" ON "ExtractedTimeSheetRow"("employeeId");
CREATE INDEX "ExtractedTimeSheetRow_hasTimeClockCode_idx" ON "ExtractedTimeSheetRow"("hasTimeClockCode");

ALTER TABLE "ScanBatch" ADD CONSTRAINT "ScanBatch_cycleId_fkey"
FOREIGN KEY ("cycleId") REFERENCES "PayrollCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScanDocument" ADD CONSTRAINT "ScanDocument_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "ScanBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtractedTimeSheetRow" ADD CONSTRAINT "ExtractedTimeSheetRow_documentId_fkey"
FOREIGN KEY ("documentId") REFERENCES "ScanDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtractedTimeSheetRow" ADD CONSTRAINT "ExtractedTimeSheetRow_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
