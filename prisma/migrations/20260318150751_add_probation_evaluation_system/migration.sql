/*
  Warnings:

  - You are about to drop the column `mentorManualName` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `mentorSource` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - Added the required column `evaluatorEmail` to the `ProbationEvaluation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `evaluatorName` to the `ProbationEvaluation` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `ProbationEvaluation` DROP FOREIGN KEY `ProbationEvaluation_evaluatedById_fkey`;

-- AlterTable
ALTER TABLE `EmailHistory` MODIFY `emailType` ENUM('EMPLOYEE_INFO', 'MONTHLY_SUMMARY', 'PROBATION_WARNING', 'PROBATION_REMINDER', 'PROBATION_ENDING', 'PROBATION_EVALUATION_LINK', 'PROBATION_MISSING_EMAIL', 'PROBATION_SUBMITTED', 'NOTICE_WARNING', 'NOTICE_ENDING', 'MANUAL_EMAIL', 'SYSTEM_NOTIFICATION', 'PROBATION_SUPERVISOR_21_DAYS', 'PROBATION_HR_INFO_21_DAYS', 'PROBATION_HR_REMINDER_1_DAY', 'PROBATION_COMPLETED', 'PROBATION_MISSING_SUPERVISOR', 'PROBATION_FORM_COMPLETED') NOT NULL;

-- AlterTable
ALTER TABLE `EmployeeOnboarding` DROP COLUMN `mentorManualName`,
    DROP COLUMN `mentorSource`,
    ADD COLUMN `mentorAssignedFrom` DATETIME(3) NULL,
    ADD COLUMN `mentorAssignedTo` DATETIME(3) NULL,
    ADD COLUMN `mentorDepartment` VARCHAR(191) NULL,
    ADD COLUMN `mentorName` VARCHAR(191) NULL,
    ADD COLUMN `mentorPersonalNumber` VARCHAR(191) NULL,
    ADD COLUMN `mentorPosition` VARCHAR(191) NULL,
    ADD COLUMN `mentorSurname` VARCHAR(191) NULL,
    ADD COLUMN `mentorTitleAfter` VARCHAR(191) NULL,
    ADD COLUMN `mentorTitleBefore` VARCHAR(191) NULL,
    ADD COLUMN `probationCompletedNotified` DATETIME(3) NULL,
    ADD COLUMN `probationEvaluationSentAt` DATETIME(3) NULL,
    ADD COLUMN `probationEvaluationSentBy` VARCHAR(191) NULL,
    ADD COLUMN `probationNotification21Sent` DATETIME(3) NULL,
    ADD COLUMN `probationNotificationHRSent` DATETIME(3) NULL,
    ADD COLUMN `probationReminder1DaySent` DATETIME(3) NULL,
    ADD COLUMN `supervisorEmail` VARCHAR(191) NULL,
    ADD COLUMN `supervisorGid` VARCHAR(191) NULL,
    ADD COLUMN `supervisorName` VARCHAR(191) NULL,
    ADD COLUMN `supervisorPersonalNumber` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `EmploymentDocument` MODIFY `type` ENUM('AFFIDAVIT', 'PERSONAL_QUESTIONNAIRE', 'EDUCATION', 'EXPERIENCE', 'PAYROLL_INFO', 'PROBATION_EVALUATION') NOT NULL;

-- AlterTable
ALTER TABLE `ProbationEvaluation` ADD COLUMN `evaluatorEmail` VARCHAR(191) NOT NULL,
    ADD COLUMN `evaluatorName` VARCHAR(191) NOT NULL,
    ADD COLUMN `leadershipSkills` TEXT NULL,
    ADD COLUMN `strategicThinking` TEXT NULL,
    MODIFY `evaluatedById` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `mail_jobs` MODIFY `type` ENUM('EMPLOYEE_INFO', 'MONTHLY_SUMMARY', 'PROBATION_WARNING', 'PROBATION_REMINDER', 'PROBATION_ENDING', 'PROBATION_EVALUATION_LINK', 'PROBATION_MISSING_EMAIL', 'PROBATION_SUBMITTED', 'NOTICE_WARNING', 'NOTICE_ENDING', 'MANUAL_EMAIL', 'SYSTEM_NOTIFICATION', 'PROBATION_SUPERVISOR_21_DAYS', 'PROBATION_HR_INFO_21_DAYS', 'PROBATION_HR_REMINDER_1_DAY', 'PROBATION_COMPLETED', 'PROBATION_MISSING_SUPERVISOR', 'PROBATION_FORM_COMPLETED') NOT NULL;

-- CreateIndex
CREATE INDEX `EmployeeOnboarding_supervisorGid_idx` ON `EmployeeOnboarding`(`supervisorGid`);

-- CreateIndex
CREATE INDEX `EmployeeOnboarding_probationEvaluationSentAt_idx` ON `EmployeeOnboarding`(`probationEvaluationSentAt`);

-- CreateIndex
CREATE INDEX `ProbationEvaluation_evaluatedAt_idx` ON `ProbationEvaluation`(`evaluatedAt`);

-- AddForeignKey
ALTER TABLE `ProbationEvaluation` ADD CONSTRAINT `ProbationEvaluation_evaluatedById_fkey` FOREIGN KEY (`evaluatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
