-- AlterTable
ALTER TABLE `EmployeeChange` ADD COLUMN `newName` VARCHAR(191) NULL,
    ADD COLUMN `newTitleAfter` VARCHAR(191) NULL,
    ADD COLUMN `newTitleBefore` VARCHAR(191) NULL,
    ADD COLUMN `oldName` VARCHAR(191) NULL,
    ADD COLUMN `oldTitleAfter` VARCHAR(191) NULL,
    ADD COLUMN `oldTitleBefore` VARCHAR(191) NULL;
