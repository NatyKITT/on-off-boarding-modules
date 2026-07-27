-- CreateTable
CREATE TABLE `EmployeeChangeLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employeeId` INTEGER NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `action` ENUM('CREATED', 'UPDATED', 'DELETED', 'RESTORED', 'REVERTED', 'CANCELLED', 'MAIL_SENT', 'MAIL_ENQUEUED', 'MAIL_FAILED', 'STATUS_CHANGED', 'NOTICE_REMINDER_SENT', 'OFFICIAL_CHANGE_APPLIED') NOT NULL,
    `field` VARCHAR(191) NOT NULL,
    `oldValue` VARCHAR(191) NULL,
    `newValue` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,

    INDEX `EmployeeChangeLog_employeeId_createdAt_idx`(`employeeId`, `createdAt`),
    INDEX `EmployeeChangeLog_action_idx`(`action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EmployeeChangeLog` ADD CONSTRAINT `EmployeeChangeLog_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `EmployeeChange`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
