-- AlterTable
ALTER TABLE `EmploymentDocument` ADD COLUMN `last_edited_at` DATETIME(3) NULL,
    ADD COLUMN `last_edited_by` VARCHAR(191) NULL;
