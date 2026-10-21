-- CreateTable
CREATE TABLE `MedicalExamSignedFile` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `onboardingId` INTEGER NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `fileData` LONGBLOB NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `uploadedBy` VARCHAR(191) NULL,

    INDEX `MedicalExamSignedFile_onboardingId_uploadedAt_idx`(`onboardingId`, `uploadedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MedicalExamSignedFile` ADD CONSTRAINT `MedicalExamSignedFile_onboardingId_fkey` FOREIGN KEY (`onboardingId`) REFERENCES `EmployeeOnboarding`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
