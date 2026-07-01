/*
  Warnings:

  - The values [PROBATION_WARNING,PROBATION_REMINDER,PROBATION_ENDING,PROBATION_EVALUATION_LINK,PROBATION_MISSING_EMAIL,PROBATION_SUBMITTED,PROBATION_FORM_COMPLETED,PROBATION_SUPERVISOR_21_DAYS,PROBATION_HR_INFO_21_DAYS,PROBATION_HR_REMINDER_1_DAY,PROBATION_COMPLETED,PROBATION_MISSING_SUPERVISOR] on the enum `mail_jobs_type` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `lastProbationReminder` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `probationCompletedNotified` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `probationEvaluationHash` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `probationEvaluationSentAt` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `probationEvaluationSentBy` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `probationHashExpiresAt` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `probationHashUsedAt` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `probationNotification21Sent` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `probationNotificationHRSent` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `probationReminder1DaySent` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `probationRemindersSent` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - The values [PROBATION_EVALUATION] on the enum `EmploymentDocument_type` will be removed. If these variants are still used in the database, this will fail.
  - The values [PROBATION_REMINDER_SENT,PROBATION_EVALUATION_SENT] on the enum `OffboardingChangeLog_action` will be removed. If these variants are still used in the database, this will fail.
  - The values [PROBATION_REMINDER_SENT,PROBATION_EVALUATION_SENT] on the enum `OffboardingChangeLog_action` will be removed. If these variants are still used in the database, this will fail.
  - The values [PROBATION_WARNING,PROBATION_REMINDER,PROBATION_ENDING,PROBATION_EVALUATION_LINK,PROBATION_MISSING_EMAIL,PROBATION_SUBMITTED,PROBATION_FORM_COMPLETED,PROBATION_SUPERVISOR_21_DAYS,PROBATION_HR_INFO_21_DAYS,PROBATION_HR_REMINDER_1_DAY,PROBATION_COMPLETED,PROBATION_MISSING_SUPERVISOR] on the enum `mail_jobs_type` will be removed. If these variants are still used in the database, this will fail.

*/
-- DropIndex
DROP INDEX `EmployeeOnboarding_probationEvaluationHash_idx` ON `EmployeeOnboarding`;

-- DropIndex
DROP INDEX `EmployeeOnboarding_probationEvaluationHash_key` ON `EmployeeOnboarding`;

-- DropIndex
DROP INDEX `EmployeeOnboarding_probationEvaluationSentAt_idx` ON `EmployeeOnboarding`;

-- AlterTable
ALTER TABLE `EmailHistory` MODIFY `emailType` ENUM('EMPLOYEE_INFO', 'MONTHLY_SUMMARY', 'PROBATION_EVALUATION_INVITE', 'PROBATION_EVALUATION_REMINDER', 'PROBATION_EVALUATION_HR_INFO', 'PROBATION_EVALUATION_HR_MISSING_SUPERVISOR', 'PROBATION_EVALUATION_HR_NOT_COMPLETED', 'PROBATION_EVALUATION_COMPLETED', 'NOTICE_WARNING', 'NOTICE_ENDING', 'SIGNATURE_INVITE', 'EXIT_CHECKLIST_SIGNATURE_INVITE', 'EXIT_SIGNATURE_INVITE', 'BEHALF_SIGNATURE_INVITE', 'EXIT_CHECKLIST_BEHALF_SIGNATURE', 'HANDOVER_RECIPIENT', 'HANDOVER_RECIPIENT_INFO', 'EXIT_CHECKLIST_HANDOVER_RECIPIENT', 'EXIT_CHECKLIST_COMPLETED', 'EXIT_CHECKLIST_COMPLETION', 'EXIT_CHECKLIST_PDF', 'EMPLOYEE_CHANGE_INFO', 'EMPLOYEE_CHANGE_SUMMARY', 'MANUAL_EMAIL', 'SYSTEM_NOTIFICATION', 'GENERIC_EMAIL', 'MENTOR_ASSIGNED') NOT NULL;

-- AlterTable
ALTER TABLE `EmployeeOnboarding` DROP COLUMN `lastProbationReminder`,
    DROP COLUMN `probationCompletedNotified`,
    DROP COLUMN `probationEvaluationHash`,
    DROP COLUMN `probationEvaluationSentAt`,
    DROP COLUMN `probationEvaluationSentBy`,
    DROP COLUMN `probationHashExpiresAt`,
    DROP COLUMN `probationHashUsedAt`,
    DROP COLUMN `probationNotification21Sent`,
    DROP COLUMN `probationNotificationHRSent`,
    DROP COLUMN `probationReminder1DaySent`,
    DROP COLUMN `probationRemindersSent`;

-- AlterTable
ALTER TABLE `EmploymentDocument` MODIFY `type` ENUM('AFFIDAVIT', 'PERSONAL_QUESTIONNAIRE', 'EDUCATION', 'EXPERIENCE', 'PAYROLL_INFO') NOT NULL;

-- AlterTable
ALTER TABLE `OffboardingChangeLog` MODIFY `action` ENUM('CREATED', 'UPDATED', 'DELETED', 'RESTORED', 'REVERTED', 'CANCELLED', 'MAIL_SENT', 'MAIL_ENQUEUED', 'MAIL_FAILED', 'STATUS_CHANGED', 'NOTICE_REMINDER_SENT', 'OFFICIAL_CHANGE_APPLIED') NOT NULL;

-- AlterTable
ALTER TABLE `OnboardingChangeLog` MODIFY `action` ENUM('CREATED', 'UPDATED', 'DELETED', 'RESTORED', 'REVERTED', 'CANCELLED', 'MAIL_SENT', 'MAIL_ENQUEUED', 'MAIL_FAILED', 'STATUS_CHANGED', 'NOTICE_REMINDER_SENT', 'OFFICIAL_CHANGE_APPLIED') NOT NULL;

-- AlterTable
ALTER TABLE `ProbationEvaluation` ADD COLUMN `lastEditedAt` DATETIME(3) NULL,
    ADD COLUMN `lastEditedBy` VARCHAR(191) NULL,
    ADD COLUMN `lastEditedByEmail` VARCHAR(191) NULL,
    ADD COLUMN `lastEditedByName` VARCHAR(191) NULL,
    ADD COLUMN `requestId` INTEGER NULL,
    ADD COLUMN `status` ENUM('ACTIVE', 'VOIDED') NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN `voidReason` TEXT NULL,
    ADD COLUMN `voidedAt` DATETIME(3) NULL,
    ADD COLUMN `voidedBy` VARCHAR(191) NULL,
    ADD COLUMN `voidedByName` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `mail_jobs` MODIFY `type` ENUM('EMPLOYEE_INFO', 'MONTHLY_SUMMARY', 'PROBATION_EVALUATION_INVITE', 'PROBATION_EVALUATION_REMINDER', 'PROBATION_EVALUATION_HR_INFO', 'PROBATION_EVALUATION_HR_MISSING_SUPERVISOR', 'PROBATION_EVALUATION_HR_NOT_COMPLETED', 'PROBATION_EVALUATION_COMPLETED', 'NOTICE_WARNING', 'NOTICE_ENDING', 'SIGNATURE_INVITE', 'EXIT_CHECKLIST_SIGNATURE_INVITE', 'EXIT_SIGNATURE_INVITE', 'BEHALF_SIGNATURE_INVITE', 'EXIT_CHECKLIST_BEHALF_SIGNATURE', 'HANDOVER_RECIPIENT', 'HANDOVER_RECIPIENT_INFO', 'EXIT_CHECKLIST_HANDOVER_RECIPIENT', 'EXIT_CHECKLIST_COMPLETED', 'EXIT_CHECKLIST_COMPLETION', 'EXIT_CHECKLIST_PDF', 'EMPLOYEE_CHANGE_INFO', 'EMPLOYEE_CHANGE_SUMMARY', 'MANUAL_EMAIL', 'SYSTEM_NOTIFICATION', 'GENERIC_EMAIL', 'MENTOR_ASSIGNED') NOT NULL;

-- CreateTable
CREATE TABLE `ProbationEvaluationRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `onboardingId` INTEGER NOT NULL,
    `formType` ENUM('REGULAR_EMPLOYEE', 'MANAGERIAL') NOT NULL,
    `status` ENUM('DRAFT', 'READY', 'SENT', 'COMPLETED', 'CANCELLED', 'EXPIRED') NOT NULL DEFAULT 'DRAFT',
    `token` VARCHAR(191) NOT NULL,
    `tokenExpiresAt` DATETIME(3) NULL,
    `probationEnd` DATETIME(3) NULL,
    `isLocked` BOOLEAN NOT NULL DEFAULT false,
    `supervisorName` VARCHAR(191) NULL,
    `supervisorEmail` VARCHAR(191) NULL,
    `sentAt` DATETIME(3) NULL,
    `sentBy` VARCHAR(191) NULL,
    `sentByName` VARCHAR(191) NULL,
    `sentMethod` ENUM('MANUAL', 'CRON') NULL,
    `hrInfoSentAt` DATETIME(3) NULL,
    `hrInfoSentBy` VARCHAR(191) NULL,
    `missingSupervisorNotifiedAt` DATETIME(3) NULL,
    `missingSupervisorNotifiedBy` VARCHAR(191) NULL,
    `lastReminderAt` DATETIME(3) NULL,
    `lastReminderBy` VARCHAR(191) NULL,
    `lastReminderByName` VARCHAR(191) NULL,
    `reminderCount` INTEGER NOT NULL DEFAULT 0,
    `hrReminderBeforeEndSentAt` DATETIME(3) NULL,
    `hrReminderBeforeEndSentBy` VARCHAR(191) NULL,
    `completedAt` DATETIME(3) NULL,
    `completedBy` VARCHAR(191) NULL,
    `completedByName` VARCHAR(191) NULL,
    `completedByEmail` VARCHAR(191) NULL,
    `completedNotificationSentAt` DATETIME(3) NULL,
    `completedNotificationSentBy` VARCHAR(191) NULL,
    `resetAt` DATETIME(3) NULL,
    `resetBy` VARCHAR(191) NULL,
    `resetByName` VARCHAR(191) NULL,
    `createdBy` VARCHAR(191) NULL,
    `createdByName` VARCHAR(191) NULL,
    `data` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProbationEvaluationRequest_onboardingId_key`(`onboardingId`),
    UNIQUE INDEX `ProbationEvaluationRequest_token_key`(`token`),
    INDEX `ProbationEvaluationRequest_onboardingId_idx`(`onboardingId`),
    INDEX `ProbationEvaluationRequest_status_idx`(`status`),
    INDEX `ProbationEvaluationRequest_token_idx`(`token`),
    INDEX `ProbationEvaluationRequest_tokenExpiresAt_idx`(`tokenExpiresAt`),
    INDEX `ProbationEvaluationRequest_probationEnd_idx`(`probationEnd`),
    INDEX `ProbationEvaluationRequest_supervisorEmail_idx`(`supervisorEmail`),
    INDEX `ProbationEvaluationRequest_sentAt_idx`(`sentAt`),
    INDEX `ProbationEvaluationRequest_lastReminderAt_idx`(`lastReminderAt`),
    INDEX `ProbationEvaluationRequest_hrReminderBeforeEndSentAt_idx`(`hrReminderBeforeEndSentAt`),
    INDEX `ProbationEvaluationRequest_completedAt_idx`(`completedAt`),
    INDEX `ProbationEvaluationRequest_missingSupervisorNotifiedAt_idx`(`missingSupervisorNotifiedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProbationEvaluationRequestEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `requestId` INTEGER NOT NULL,
    `action` ENUM('CREATED', 'UPDATED', 'INVITE_QUEUED', 'INVITE_SENT', 'REMINDER_QUEUED', 'REMINDER_SENT', 'HR_INFO_QUEUED', 'HR_INFO_SENT', 'HR_REMINDER_QUEUED', 'HR_REMINDER_SENT', 'MISSING_SUPERVISOR', 'COMPLETED', 'EDITED', 'RESET', 'LOCKED', 'UNLOCKED', 'TOKEN_REGENERATED', 'CANCELLED', 'EXPIRED', 'EMAIL_FAILED') NOT NULL,
    `by` VARCHAR(191) NULL,
    `byName` VARCHAR(191) NULL,
    `byEmail` VARCHAR(191) NULL,
    `mailQueueId` INTEGER NULL,
    `message` TEXT NULL,
    `meta` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProbationEvaluationRequestEvent_requestId_idx`(`requestId`),
    INDEX `ProbationEvaluationRequestEvent_action_idx`(`action`),
    INDEX `ProbationEvaluationRequestEvent_mailQueueId_idx`(`mailQueueId`),
    INDEX `ProbationEvaluationRequestEvent_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ProbationEvaluation_requestId_idx` ON `ProbationEvaluation`(`requestId`);

-- CreateIndex
CREATE INDEX `ProbationEvaluation_status_idx` ON `ProbationEvaluation`(`status`);

-- AddForeignKey
ALTER TABLE `ProbationEvaluationRequest` ADD CONSTRAINT `ProbationEvaluationRequest_onboardingId_fkey` FOREIGN KEY (`onboardingId`) REFERENCES `EmployeeOnboarding`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProbationEvaluationRequestEvent` ADD CONSTRAINT `ProbationEvaluationRequestEvent_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `ProbationEvaluationRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProbationEvaluationRequestEvent` ADD CONSTRAINT `ProbationEvaluationRequestEvent_mailQueueId_fkey` FOREIGN KEY (`mailQueueId`) REFERENCES `mail_jobs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProbationEvaluation` ADD CONSTRAINT `ProbationEvaluation_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `ProbationEvaluationRequest`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
