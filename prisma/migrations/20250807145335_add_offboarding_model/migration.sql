/*
  Warnings:

  - You are about to drop the column `buildingAccess` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `checklistNote` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `itNote` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `needsDesktop` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `needsDock` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `needsKeyboard` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `needsMobile` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `needsMonitor` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `needsMouse` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `needsNotebook` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `needsSimNew` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `payGrade` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `simTransfer` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `trainingNote` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the `ChangeLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ChecklistItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `EmployeeChecklistProgress` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `ChangeLog` DROP FOREIGN KEY `ChangeLog_employeeId_fkey`;

-- DropForeignKey
ALTER TABLE `EmployeeChecklistProgress` DROP FOREIGN KEY `EmployeeChecklistProgress_checklistId_fkey`;

-- DropForeignKey
ALTER TABLE `EmployeeChecklistProgress` DROP FOREIGN KEY `EmployeeChecklistProgress_employeeId_fkey`;

-- AlterTable
ALTER TABLE `EmployeeOnboarding` DROP COLUMN `buildingAccess`,
    DROP COLUMN `checklistNote`,
    DROP COLUMN `itNote`,
    DROP COLUMN `needsDesktop`,
    DROP COLUMN `needsDock`,
    DROP COLUMN `needsKeyboard`,
    DROP COLUMN `needsMobile`,
    DROP COLUMN `needsMonitor`,
    DROP COLUMN `needsMouse`,
    DROP COLUMN `needsNotebook`,
    DROP COLUMN `needsSimNew`,
    DROP COLUMN `payGrade`,
    DROP COLUMN `simTransfer`,
    DROP COLUMN `trainingNote`;

-- DropTable
DROP TABLE `ChangeLog`;

-- DropTable
DROP TABLE `ChecklistItem`;

-- DropTable
DROP TABLE `EmployeeChecklistProgress`;

-- CreateTable
CREATE TABLE `EmployeeOffboarding` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NULL,
    `status` ENUM('NEW', 'IN_PROGRESS', 'COMPLETED') NOT NULL DEFAULT 'NEW',
    `plannedStart` DATETIME(3) NOT NULL,
    `actualStart` DATETIME(3) NULL,
    `titleBefore` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `surname` VARCHAR(191) NOT NULL,
    `titleAfter` VARCHAR(191) NULL,
    `userName` VARCHAR(191) NULL,
    `userEmail` VARCHAR(191) NULL,
    `positionNum` VARCHAR(191) NOT NULL,
    `positionName` VARCHAR(191) NOT NULL,
    `department` VARCHAR(191) NOT NULL,
    `unitName` VARCHAR(191) NOT NULL,
    `evidenceNumber` VARCHAR(191) NULL,
    `itStatus` VARCHAR(191) NULL,
    `plannedEnd` DATETIME(3) NOT NULL,
    `actualEnd` DATETIME(3) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OnboardingChangeLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employeeId` INTEGER NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `field` VARCHAR(191) NOT NULL,
    `oldValue` VARCHAR(191) NULL,
    `newValue` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OffboardingChangeLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employeeId` INTEGER NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `field` VARCHAR(191) NOT NULL,
    `oldValue` VARCHAR(191) NULL,
    `newValue` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `EmployeeOffboarding` ADD CONSTRAINT `EmployeeOffboarding_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OnboardingChangeLog` ADD CONSTRAINT `OnboardingChangeLog_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `EmployeeOnboarding`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OffboardingChangeLog` ADD CONSTRAINT `OffboardingChangeLog_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `EmployeeOffboarding`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
