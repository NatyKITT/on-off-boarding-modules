/*
  Warnings:

  - You are about to drop the `MailQueue` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE `MailQueue`;

-- CreateTable
CREATE TABLE `mail_jobs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('ACTUAL_ALL', 'PLANNED_IT', 'PLANNED_FACILITY', 'PLANNED_HR', 'PLANNED_TRAINING', 'CANDIDATE_INVITE') NOT NULL,
    `payload` JSON NOT NULL,
    `sendAt` DATETIME(3) NULL,
    `status` ENUM('QUEUED', 'SENT', 'FAILED') NOT NULL DEFAULT 'QUEUED',
    `error` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sentAt` DATETIME(3) NULL,
    `createdBy` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
