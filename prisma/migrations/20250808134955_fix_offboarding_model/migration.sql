/*
  Warnings:

  - You are about to drop the column `actualStart` on the `EmployeeOffboarding` table. All the data in the column will be lost.
  - You are about to drop the column `plannedStart` on the `EmployeeOffboarding` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `EmployeeOffboarding` DROP COLUMN `actualStart`,
    DROP COLUMN `plannedStart`;
