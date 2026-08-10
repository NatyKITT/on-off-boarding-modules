-- AlterTable
ALTER TABLE `EmployeeOffboarding` ADD COLUMN `supervisorDepartment` VARCHAR(191) NULL,
    ADD COLUMN `supervisorEmail` VARCHAR(191) NULL,
    ADD COLUMN `supervisorGid` VARCHAR(191) NULL,
    ADD COLUMN `supervisorManualOverride` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `supervisorName` VARCHAR(191) NULL,
    ADD COLUMN `supervisorPersonalNumber` VARCHAR(191) NULL,
    ADD COLUMN `supervisorPosition` VARCHAR(191) NULL,
    ADD COLUMN `supervisorSource` ENUM('USER', 'EOS', 'MANUAL') NULL,
    ADD COLUMN `supervisorSurname` VARCHAR(191) NULL,
    ADD COLUMN `supervisorTitleAfter` VARCHAR(191) NULL,
    ADD COLUMN `supervisorTitleBefore` VARCHAR(191) NULL,
    ADD COLUMN `supervisorUnitName` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `EmployeeOffboarding_supervisorEmail_idx` ON `EmployeeOffboarding`(`supervisorEmail`);

-- CreateIndex
CREATE INDEX `EmployeeOffboarding_supervisorPersonalNumber_idx` ON `EmployeeOffboarding`(`supervisorPersonalNumber`);

