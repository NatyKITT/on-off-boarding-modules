/*
  Warnings:

  - You are about to drop the column `leadershipSkills` on the `ProbationEvaluation` table. All the data in the column will be lost.
  - You are about to drop the column `strategicThinking` on the `ProbationEvaluation` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `EmailHistory` MODIFY `emailType` ENUM('EMPLOYEE_INFO', 'MONTHLY_SUMMARY', 'PROBATION_WARNING', 'PROBATION_REMINDER', 'PROBATION_ENDING', 'PROBATION_EVALUATION_LINK', 'PROBATION_MISSING_EMAIL', 'PROBATION_SUBMITTED', 'NOTICE_WARNING', 'NOTICE_ENDING', 'MANUAL_EMAIL', 'SYSTEM_NOTIFICATION', 'PROBATION_SUPERVISOR_21_DAYS', 'PROBATION_HR_INFO_21_DAYS', 'PROBATION_HR_REMINDER_1_DAY', 'PROBATION_COMPLETED', 'PROBATION_MISSING_SUPERVISOR', 'PROBATION_FORM_COMPLETED', 'MENTOR_ASSIGNED') NOT NULL;

-- AlterTable
ALTER TABLE `EmployeeOnboarding` ADD COLUMN `mentorEmail` VARCHAR(191) NULL,
    ADD COLUMN `mentorGid` VARCHAR(191) NULL,
    ADD COLUMN `mentorNotificationSentAt` DATETIME(3) NULL,
    ADD COLUMN `mentorSource` ENUM('USER', 'EOS', 'MANUAL') NULL,
    ADD COLUMN `mentorUnitName` VARCHAR(191) NULL,
    ADD COLUMN `supervisorDepartment` VARCHAR(191) NULL,
    ADD COLUMN `supervisorManualOverride` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `supervisorPosition` VARCHAR(191) NULL,
    ADD COLUMN `supervisorSource` ENUM('USER', 'EOS', 'MANUAL') NULL,
    ADD COLUMN `supervisorSurname` VARCHAR(191) NULL,
    ADD COLUMN `supervisorTitleAfter` VARCHAR(191) NULL,
    ADD COLUMN `supervisorTitleBefore` VARCHAR(191) NULL,
    ADD COLUMN `supervisorUnitName` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `ProbationEvaluation` DROP COLUMN `leadershipSkills`,
    DROP COLUMN `strategicThinking`;

-- AlterTable
ALTER TABLE `mail_jobs` MODIFY `type` ENUM('EMPLOYEE_INFO', 'MONTHLY_SUMMARY', 'PROBATION_WARNING', 'PROBATION_REMINDER', 'PROBATION_ENDING', 'PROBATION_EVALUATION_LINK', 'PROBATION_MISSING_EMAIL', 'PROBATION_SUBMITTED', 'NOTICE_WARNING', 'NOTICE_ENDING', 'MANUAL_EMAIL', 'SYSTEM_NOTIFICATION', 'PROBATION_SUPERVISOR_21_DAYS', 'PROBATION_HR_INFO_21_DAYS', 'PROBATION_HR_REMINDER_1_DAY', 'PROBATION_COMPLETED', 'PROBATION_MISSING_SUPERVISOR', 'PROBATION_FORM_COMPLETED', 'MENTOR_ASSIGNED') NOT NULL;

-- CreateIndex
CREATE INDEX `EmployeeOnboarding_mentorGid_idx` ON `EmployeeOnboarding`(`mentorGid`);

-- CreateIndex
CREATE INDEX `EmployeeOnboarding_mentorEmail_idx` ON `EmployeeOnboarding`(`mentorEmail`);

-- CreateIndex
CREATE INDEX `EmployeeOnboarding_mentorPersonalNumber_idx` ON `EmployeeOnboarding`(`mentorPersonalNumber`);

-- CreateIndex
CREATE INDEX `EmployeeOnboarding_supervisorEmail_idx` ON `EmployeeOnboarding`(`supervisorEmail`);

-- CreateIndex
CREATE INDEX `EmployeeOnboarding_supervisorPersonalNumber_idx` ON `EmployeeOnboarding`(`supervisorPersonalNumber`);
