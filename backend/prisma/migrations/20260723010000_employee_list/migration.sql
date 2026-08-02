CREATE TYPE "ImportStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "EmployeeListImport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageUrl" TEXT,
    "storageKey" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'ACTIVE',
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "EmployeeListImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "matricule" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "normalizedFullName" TEXT NOT NULL,
    "listImportId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Employee_matricule_key" ON "Employee"("matricule");
CREATE INDEX "EmployeeListImport_status_idx" ON "EmployeeListImport"("status");
CREATE INDEX "EmployeeListImport_importedAt_idx" ON "EmployeeListImport"("importedAt");
CREATE INDEX "Employee_normalizedFullName_idx" ON "Employee"("normalizedFullName");
CREATE INDEX "Employee_listImportId_idx" ON "Employee"("listImportId");

ALTER TABLE "Employee"
ADD CONSTRAINT "Employee_listImportId_fkey"
FOREIGN KEY ("listImportId") REFERENCES "EmployeeListImport"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
