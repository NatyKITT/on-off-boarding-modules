/*
  Warnings:

  - Made the column `public_token` on table `ExitChecklist` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `ExitChecklist` MODIFY `public_token` VARCHAR(191) NOT NULL;
