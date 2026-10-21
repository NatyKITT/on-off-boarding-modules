-- AlterTable
ALTER TABLE `EmployeeOnboarding` ADD COLUMN `documentsLockedAt` DATETIME(3) NULL,
    ADD COLUMN `documentsLockedBy` VARCHAR(191) NULL,
    ADD COLUMN `documentsReadinessStatus` ENUM('IN_PROGRESS', 'READY', 'LOCKED') NOT NULL DEFAULT 'IN_PROGRESS',
    ADD COLUMN `documentsReadyAt` DATETIME(3) NULL;
