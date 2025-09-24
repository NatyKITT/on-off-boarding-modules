/*
  Warnings:

  - You are about to drop the column `needsSim` on the `EmployeeOnboarding` table. All the data in the column will be lost.
  - You are about to drop the column `simNew` on the `EmployeeOnboarding` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `EmployeeOnboarding` DROP COLUMN `needsSim`,
    DROP COLUMN `simNew`,
    ADD COLUMN `needsDesktop` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `needsKeyboard` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `needsMonitor` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `needsMouse` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `needsSimNew` BOOLEAN NOT NULL DEFAULT false;
