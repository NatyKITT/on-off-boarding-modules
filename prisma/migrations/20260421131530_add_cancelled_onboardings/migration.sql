-- AlterTable
ALTER TABLE `EmployeeOnboarding` ADD COLUMN `cancelReason` VARCHAR(191) NULL,
    ADD COLUMN `cancelledAt` DATETIME(3) NULL,
    ADD COLUMN `cancelledBy` VARCHAR(191) NULL;
