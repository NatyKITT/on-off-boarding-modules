/*
  Warnings:

  - A unique constraint covering the columns `[personalNumber]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `EmployeeOffboarding` ADD COLUMN `noticeEnd` DATETIME(3) NULL,
    ADD COLUMN `noticeMonths` INTEGER NULL DEFAULT 2;

-- AlterTable
ALTER TABLE `EmployeeOnboarding` ADD COLUMN `isManager` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `probationEnd` DATETIME(3) NULL,
    ADD COLUMN `probationMonths` INTEGER NULL DEFAULT 3;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `personalNumber` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `users_personalNumber_key` ON `users`(`personalNumber`);
