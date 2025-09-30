-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `surname` VARCHAR(191) NULL,
    `email` VARCHAR(191) NOT NULL,
    `email_verified` DATETIME(3) NULL,
    `image` VARCHAR(191) NULL,
    `personalNumber` VARCHAR(191) NULL,
    `role` ENUM('USER', 'HR', 'IT', 'ADMIN') NOT NULL DEFAULT 'USER',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_personalNumber_key`(`personalNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accounts` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `provider_account_id` VARCHAR(191) NOT NULL,
    `refresh_token` TEXT NULL,
    `access_token` TEXT NULL,
    `expires_at` INTEGER NULL,
    `token_type` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NULL,
    `id_token` TEXT NULL,
    `session_state` VARCHAR(191) NULL,

    INDEX `accounts_user_id_idx`(`user_id`),
    UNIQUE INDEX `accounts_provider_provider_account_id_key`(`provider`, `provider_account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` VARCHAR(191) NOT NULL,
    `session_token` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sessions_session_token_key`(`session_token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeOnboarding` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NULL,
    `status` ENUM('NEW', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'NEW',
    `plannedStart` DATETIME(3) NOT NULL,
    `actualStart` DATETIME(3) NULL,
    `startTime` VARCHAR(191) NULL DEFAULT '08:00',
    `titleBefore` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `surname` VARCHAR(191) NOT NULL,
    `titleAfter` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `userName` VARCHAR(191) NULL,
    `userEmail` VARCHAR(191) NULL,
    `positionNum` VARCHAR(191) NOT NULL,
    `positionName` VARCHAR(191) NOT NULL,
    `department` VARCHAR(191) NOT NULL,
    `unitName` VARCHAR(191) NOT NULL,
    `evidenceNumber` VARCHAR(191) NULL,
    `itStatus` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `deletedBy` VARCHAR(191) NULL,
    `deleteReason` VARCHAR(191) NULL,
    `isManager` BOOLEAN NOT NULL DEFAULT false,
    `probationMonths` INTEGER NULL DEFAULT 3,
    `probationEnd` DATETIME(3) NULL,
    `lastProbationReminder` DATETIME(3) NULL,
    `probationRemindersSent` INTEGER NOT NULL DEFAULT 0,

    INDEX `EmployeeOnboarding_plannedStart_idx`(`plannedStart`),
    INDEX `EmployeeOnboarding_actualStart_idx`(`actualStart`),
    INDEX `EmployeeOnboarding_deletedAt_idx`(`deletedAt`),
    INDEX `EmployeeOnboarding_probationEnd_idx`(`probationEnd`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeOffboarding` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NULL,
    `status` ENUM('NEW', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'NEW',
    `plannedEnd` DATETIME(3) NOT NULL,
    `actualEnd` DATETIME(3) NULL,
    `titleBefore` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `surname` VARCHAR(191) NOT NULL,
    `titleAfter` VARCHAR(191) NULL,
    `userName` VARCHAR(191) NULL,
    `userEmail` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `positionNum` VARCHAR(191) NOT NULL,
    `positionName` VARCHAR(191) NOT NULL,
    `department` VARCHAR(191) NOT NULL,
    `unitName` VARCHAR(191) NOT NULL,
    `evidenceNumber` VARCHAR(191) NULL,
    `itStatus` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `deletedBy` VARCHAR(191) NULL,
    `deleteReason` VARCHAR(191) NULL,
    `noticeMonths` INTEGER NULL DEFAULT 2,
    `noticeEnd` DATETIME(3) NULL,
    `lastNoticeReminder` DATETIME(3) NULL,
    `noticeRemindersSent` INTEGER NOT NULL DEFAULT 0,

    INDEX `EmployeeOffboarding_plannedEnd_idx`(`plannedEnd`),
    INDEX `EmployeeOffboarding_actualEnd_idx`(`actualEnd`),
    INDEX `EmployeeOffboarding_deletedAt_idx`(`deletedAt`),
    INDEX `EmployeeOffboarding_noticeEnd_idx`(`noticeEnd`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OnboardingChangeLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employeeId` INTEGER NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `action` ENUM('CREATED', 'UPDATED', 'DELETED', 'RESTORED', 'MAIL_SENT', 'MAIL_FAILED', 'STATUS_CHANGED', 'PROBATION_REMINDER_SENT', 'NOTICE_REMINDER_SENT') NOT NULL,
    `field` VARCHAR(191) NOT NULL,
    `oldValue` VARCHAR(191) NULL,
    `newValue` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,

    INDEX `OnboardingChangeLog_employeeId_createdAt_idx`(`employeeId`, `createdAt`),
    INDEX `OnboardingChangeLog_action_idx`(`action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OffboardingChangeLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employeeId` INTEGER NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `action` ENUM('CREATED', 'UPDATED', 'DELETED', 'RESTORED', 'MAIL_SENT', 'MAIL_FAILED', 'STATUS_CHANGED', 'PROBATION_REMINDER_SENT', 'NOTICE_REMINDER_SENT') NOT NULL,
    `field` VARCHAR(191) NOT NULL,
    `oldValue` VARCHAR(191) NULL,
    `newValue` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,

    INDEX `OffboardingChangeLog_employeeId_createdAt_idx`(`employeeId`, `createdAt`),
    INDEX `OffboardingChangeLog_action_idx`(`action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmailHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mailQueueId` INTEGER NULL,
    `onboardingEmployeeId` INTEGER NULL,
    `offboardingEmployeeId` INTEGER NULL,
    `emailType` ENUM('EMPLOYEE_INFO', 'MONTHLY_SUMMARY', 'PROBATION_WARNING', 'PROBATION_REMINDER', 'PROBATION_ENDING', 'NOTICE_WARNING', 'NOTICE_ENDING', 'MANUAL_EMAIL', 'SYSTEM_NOTIFICATION') NOT NULL,
    `recipients` JSON NOT NULL,
    `subject` VARCHAR(191) NOT NULL,
    `content` TEXT NULL,
    `status` ENUM('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED') NOT NULL,
    `sentAt` DATETIME(3) NULL,
    `error` TEXT NULL,
    `createdBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EmailHistory_emailType_idx`(`emailType`),
    INDEX `EmailHistory_status_idx`(`status`),
    INDEX `EmailHistory_sentAt_idx`(`sentAt`),
    INDEX `EmailHistory_onboardingEmployeeId_idx`(`onboardingEmployeeId`),
    INDEX `EmailHistory_offboardingEmployeeId_idx`(`offboardingEmployeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mail_jobs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('EMPLOYEE_INFO', 'MONTHLY_SUMMARY', 'PROBATION_WARNING', 'PROBATION_REMINDER', 'PROBATION_ENDING', 'NOTICE_WARNING', 'NOTICE_ENDING', 'MANUAL_EMAIL', 'SYSTEM_NOTIFICATION') NOT NULL,
    `payload` JSON NOT NULL,
    `sendAt` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'QUEUED',
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sentAt` DATETIME(3) NULL,
    `createdBy` VARCHAR(191) NULL,
    `priority` INTEGER NOT NULL DEFAULT 5,
    `retryCount` INTEGER NOT NULL DEFAULT 0,
    `maxRetries` INTEGER NOT NULL DEFAULT 3,

    INDEX `mail_jobs_status_sendAt_idx`(`status`, `sendAt`),
    INDEX `mail_jobs_type_idx`(`type`),
    INDEX `mail_jobs_priority_idx`(`priority`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MonthlyReport` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `month` VARCHAR(191) NOT NULL,
    `reportType` VARCHAR(191) NOT NULL,
    `recipients` JSON NOT NULL,
    `generatedBy` VARCHAR(191) NOT NULL,
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `data` JSON NOT NULL,

    INDEX `MonthlyReport_month_idx`(`month`),
    INDEX `MonthlyReport_sentAt_idx`(`sentAt`),
    UNIQUE INDEX `MonthlyReport_month_reportType_key`(`month`, `reportType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemSettings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `updatedBy` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `SystemSettings_key_key`(`key`),
    INDEX `SystemSettings_key_idx`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeOnboarding` ADD CONSTRAINT `EmployeeOnboarding_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeOffboarding` ADD CONSTRAINT `EmployeeOffboarding_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OnboardingChangeLog` ADD CONSTRAINT `OnboardingChangeLog_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `EmployeeOnboarding`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OffboardingChangeLog` ADD CONSTRAINT `OffboardingChangeLog_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `EmployeeOffboarding`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailHistory` ADD CONSTRAINT `EmailHistory_mailQueueId_fkey` FOREIGN KEY (`mailQueueId`) REFERENCES `mail_jobs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailHistory` ADD CONSTRAINT `EmailHistory_onboardingEmployeeId_fkey` FOREIGN KEY (`onboardingEmployeeId`) REFERENCES `EmployeeOnboarding`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmailHistory` ADD CONSTRAINT `EmailHistory_offboardingEmployeeId_fkey` FOREIGN KEY (`offboardingEmployeeId`) REFERENCES `EmployeeOffboarding`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

