DROP INDEX IF EXISTS "Employee_matricule_key";

CREATE UNIQUE INDEX "Employee_listImportId_matricule_key"
ON "Employee"("listImportId", "matricule");
