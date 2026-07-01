-- AlterTable
ALTER TABLE `EmployeeOnboarding` ADD COLUMN `hasCustomDates` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `probationExtensionSummary` TEXT NULL,
    ADD COLUMN `probationExtensions` JSON NULL;
