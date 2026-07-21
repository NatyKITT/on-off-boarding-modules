-- AlterTable
ALTER TABLE `EmploymentDocument` ADD COLUMN `sent_at` DATETIME(3) NULL,
    ADD COLUMN `sent_by` VARCHAR(191) NULL;
