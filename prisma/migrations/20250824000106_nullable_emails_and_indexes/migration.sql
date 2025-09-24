/*
  Warnings:

  - The values [ACTUAL_ALL,PLANNED_IT,PLANNED_FACILITY,PLANNED_HR,PLANNED_TRAINING,CANDIDATE_INVITE] on the enum `mail_jobs_type` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `mail_jobs` MODIFY `type` ENUM('EMPLOYEE_INFO', 'MONTHLY_SUMMARY') NOT NULL;

-- CreateIndex
CREATE INDEX `EmployeeOffboarding_plannedEnd_idx` ON `EmployeeOffboarding`(`plannedEnd`);

-- CreateIndex
CREATE INDEX `EmployeeOffboarding_actualEnd_idx` ON `EmployeeOffboarding`(`actualEnd`);

-- CreateIndex
CREATE INDEX `EmployeeOnboarding_plannedStart_idx` ON `EmployeeOnboarding`(`plannedStart`);

-- CreateIndex
CREATE INDEX `EmployeeOnboarding_actualStart_idx` ON `EmployeeOnboarding`(`actualStart`);

-- CreateIndex
CREATE INDEX `OffboardingChangeLog_employeeId_createdAt_idx` ON `OffboardingChangeLog`(`employeeId`, `createdAt`);

-- CreateIndex
CREATE INDEX `OnboardingChangeLog_employeeId_createdAt_idx` ON `OnboardingChangeLog`(`employeeId`, `createdAt`);
