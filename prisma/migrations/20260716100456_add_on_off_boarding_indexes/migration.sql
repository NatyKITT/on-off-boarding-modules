-- DropIndex
DROP INDEX `EmployeeOffboarding_deletedAt_idx` ON `EmployeeOffboarding`;

-- DropIndex
DROP INDEX `EmployeeOnboarding_deletedAt_idx` ON `EmployeeOnboarding`;

-- CreateIndex
CREATE INDEX `EmployeeOffboarding_deletedAt_plannedEnd_idx` ON `EmployeeOffboarding`(`deletedAt`, `plannedEnd`);

-- CreateIndex
CREATE INDEX `EmployeeOffboarding_evidenceNumber_idx` ON `EmployeeOffboarding`(`evidenceNumber`);

-- CreateIndex
CREATE INDEX `EmployeeOnboarding_deletedAt_plannedStart_idx` ON `EmployeeOnboarding`(`deletedAt`, `plannedStart`);

-- CreateIndex
CREATE INDEX `EmployeeOnboarding_evidenceNumber_idx` ON `EmployeeOnboarding`(`evidenceNumber`);
