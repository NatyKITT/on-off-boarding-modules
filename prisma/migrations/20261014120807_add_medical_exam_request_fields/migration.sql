-- AlterTable
ALTER TABLE `EmployeeOnboarding` ADD COLUMN `medicalExamAppointmentAt` DATETIME(3) NULL,
    ADD COLUMN `medicalExamJobDescription` TEXT NULL,
    ADD COLUMN `medicalExamRequestGeneratedAt` DATETIME(3) NULL,
    ADD COLUMN `medicalExamRequestSentAt` DATETIME(3) NULL,
    ADD COLUMN `medicalExamRequestSentBy` VARCHAR(191) NULL,
    ADD COLUMN `medicalExamRiskFactors` TEXT NULL,
    ADD COLUMN `medicalExamVariant` ENUM('ULZ', 'OWN_DOCTOR') NULL,
    ADD COLUMN `medicalExamWorkCategory` VARCHAR(191) NULL,
    ADD COLUMN `medicalExamWorkRegime` VARCHAR(191) NULL;
