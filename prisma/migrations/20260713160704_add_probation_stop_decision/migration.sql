-- AlterTable
ALTER TABLE `EmployeeOffboarding` ADD COLUMN `probationStopDecision` ENUM('STOP', 'KEEP') NULL,
    ADD COLUMN `probationStopDecisionAt` DATETIME(3) NULL,
    ADD COLUMN `probationStopDecisionBy` VARCHAR(191) NULL,
    ADD COLUMN `probationStopNote` TEXT NULL;
