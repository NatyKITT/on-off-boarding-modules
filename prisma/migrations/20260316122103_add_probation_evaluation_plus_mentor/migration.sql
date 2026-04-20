/*
  Warnings:

  - A unique constraint covering the columns `[probationEvaluationHash]` on the table `EmployeeOnboarding` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `EmailHistory` MODIFY `emailType` ENUM('EMPLOYEE_INFO', 'MONTHLY_SUMMARY', 'PROBATION_WARNING', 'PROBATION_REMINDER', 'PROBATION_ENDING', 'PROBATION_EVALUATION_LINK', 'PROBATION_MISSING_EMAIL', 'PROBATION_SUBMITTED', 'NOTICE_WARNING', 'NOTICE_ENDING', 'MANUAL_EMAIL', 'SYSTEM_NOTIFICATION') NOT NULL;

-- AlterTable
ALTER TABLE `EmployeeOnboarding` ADD COLUMN `mentorId` VARCHAR(191) NULL,
    ADD COLUMN `mentorManualName` VARCHAR(191) NULL,
    ADD COLUMN `mentorSource` ENUM('USER', 'MANUAL') NULL,
    ADD COLUMN `positionType` ENUM('REGULAR', 'MANAGERIAL') NOT NULL DEFAULT 'REGULAR',
    ADD COLUMN `probationEvaluationHash` VARCHAR(191) NULL,
    ADD COLUMN `probationHashExpiresAt` DATETIME(3) NULL,
    ADD COLUMN `probationHashUsedAt` DATETIME(3) NULL,
    MODIFY `probationMonths` INTEGER NULL DEFAULT 4;

-- AlterTable
ALTER TABLE `OffboardingChangeLog` MODIFY `action` ENUM('CREATED', 'UPDATED', 'DELETED', 'RESTORED', 'REVERTED', 'MAIL_SENT', 'MAIL_ENQUEUED', 'MAIL_FAILED', 'STATUS_CHANGED', 'PROBATION_REMINDER_SENT', 'PROBATION_EVALUATION_SENT', 'NOTICE_REMINDER_SENT') NOT NULL;

-- AlterTable
ALTER TABLE `OnboardingChangeLog` MODIFY `action` ENUM('CREATED', 'UPDATED', 'DELETED', 'RESTORED', 'REVERTED', 'MAIL_SENT', 'MAIL_ENQUEUED', 'MAIL_FAILED', 'STATUS_CHANGED', 'PROBATION_REMINDER_SENT', 'PROBATION_EVALUATION_SENT', 'NOTICE_REMINDER_SENT') NOT NULL;

-- AlterTable
ALTER TABLE `mail_jobs` MODIFY `type` ENUM('EMPLOYEE_INFO', 'MONTHLY_SUMMARY', 'PROBATION_WARNING', 'PROBATION_REMINDER', 'PROBATION_ENDING', 'PROBATION_EVALUATION_LINK', 'PROBATION_MISSING_EMAIL', 'PROBATION_SUBMITTED', 'NOTICE_WARNING', 'NOTICE_ENDING', 'MANUAL_EMAIL', 'SYSTEM_NOTIFICATION') NOT NULL;

-- CreateTable
CREATE TABLE `ProbationEvaluation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `onboardingId` INTEGER NOT NULL,
    `formType` ENUM('REGULAR_EMPLOYEE', 'MANAGERIAL') NOT NULL,
    `workPerformance` TEXT NOT NULL,
    `socialBehavior` TEXT NOT NULL,
    `recommendation` BOOLEAN NOT NULL,
    `reasonIfNo` TEXT NULL,
    `evaluatedById` VARCHAR(191) NOT NULL,
    `evaluatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `pdfUrl` VARCHAR(191) NULL,
    `pdfGeneratedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ProbationEvaluation_onboardingId_idx`(`onboardingId`),
    INDEX `ProbationEvaluation_evaluatedById_idx`(`evaluatedById`),
    INDEX `ProbationEvaluation_formType_idx`(`formType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `EmployeeOnboarding_probationEvaluationHash_key` ON `EmployeeOnboarding`(`probationEvaluationHash`);

-- CreateIndex
CREATE INDEX `EmployeeOnboarding_mentorId_idx` ON `EmployeeOnboarding`(`mentorId`);

-- CreateIndex
CREATE INDEX `EmployeeOnboarding_positionType_idx` ON `EmployeeOnboarding`(`positionType`);

-- CreateIndex
CREATE INDEX `EmployeeOnboarding_probationEvaluationHash_idx` ON `EmployeeOnboarding`(`probationEvaluationHash`);

-- AddForeignKey
ALTER TABLE `EmployeeOnboarding` ADD CONSTRAINT `EmployeeOnboarding_mentorId_fkey` FOREIGN KEY (`mentorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProbationEvaluation` ADD CONSTRAINT `ProbationEvaluation_onboardingId_fkey` FOREIGN KEY (`onboardingId`) REFERENCES `EmployeeOnboarding`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProbationEvaluation` ADD CONSTRAINT `ProbationEvaluation_evaluatedById_fkey` FOREIGN KEY (`evaluatedById`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
