/*
  Warnings:

  - A unique constraint covering the columns `[public_token]` on the table `ExitChecklist` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `ExitChecklist` ADD COLUMN `public_token` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `canAccessApp` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX `ExitChecklist_public_token_key` ON `ExitChecklist`(`public_token`);
