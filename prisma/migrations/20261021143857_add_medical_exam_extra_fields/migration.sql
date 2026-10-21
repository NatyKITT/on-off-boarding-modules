-- AlterTable
ALTER TABLE `EmployeeOnboarding` ADD COLUMN `medicalExamExamReason` TEXT NULL,
    ADD COLUMN `medicalExamJobTitle` VARCHAR(191) NULL,
    ADD COLUMN `medicalExamProfessionalRisk` TEXT NULL,
    ADD COLUMN `medicalExamType` VARCHAR(191) NULL;
