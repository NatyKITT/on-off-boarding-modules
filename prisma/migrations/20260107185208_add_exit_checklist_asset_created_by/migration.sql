-- AlterTable
ALTER TABLE `ExitChecklistAsset` ADD COLUMN `createdById` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `ExitChecklistAsset` ADD CONSTRAINT `ExitChecklistAsset_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
