-- AlterTable
ALTER TABLE `EmployeeOnboarding` MODIFY `status` ENUM('NEW', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'NEW';

-- CreateIndex
CREATE INDEX `EmployeeOnboarding_cancelledAt_idx` ON `EmployeeOnboarding`(`cancelledAt`);
