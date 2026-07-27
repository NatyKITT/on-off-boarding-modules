-- CreateTable
CREATE TABLE `EmploymentDocumentEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `documentId` INTEGER NOT NULL,
    `action` ENUM('CREATED', 'SENT', 'FILLED', 'EDITED', 'LOCKED', 'UNLOCKED', 'RESET', 'REGENERATED', 'PDF_DOWNLOADED', 'EMAIL_FAILED') NOT NULL,
    `by` VARCHAR(191) NULL,
    `byName` VARCHAR(191) NULL,
    `byEmail` VARCHAR(191) NULL,
    `message` TEXT NULL,
    `meta` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EmploymentDocumentEvent_documentId_idx`(`documentId`),
    INDEX `EmploymentDocumentEvent_action_idx`(`action`),
    INDEX `EmploymentDocumentEvent_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExitChecklistEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `checklistId` INTEGER NOT NULL,
    `action` ENUM('LOCKED', 'UNLOCKED', 'UPDATED', 'ASSET_ADDED', 'ASSET_UPDATED', 'ASSET_REMOVED', 'SIGNATURE_INVITE_SENT', 'HANDOVER_RECIPIENT_INVITE_SENT', 'PDF_DOWNLOADED', 'EMAIL_FAILED') NOT NULL,
    `by` VARCHAR(191) NULL,
    `byName` VARCHAR(191) NULL,
    `byEmail` VARCHAR(191) NULL,
    `message` TEXT NULL,
    `meta` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ExitChecklistEvent_checklistId_idx`(`checklistId`),
    INDEX `ExitChecklistEvent_action_idx`(`action`),
    INDEX `ExitChecklistEvent_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EmploymentDocumentEvent` ADD CONSTRAINT `EmploymentDocumentEvent_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `EmploymentDocument`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ExitChecklistEvent` ADD CONSTRAINT `ExitChecklistEvent_checklistId_fkey` FOREIGN KEY (`checklistId`) REFERENCES `ExitChecklist`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
