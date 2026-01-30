-- AlterTable
ALTER TABLE `users` ADD COLUMN `exit_checklist_keys` JSON NULL,
    MODIFY `role` ENUM('USER', 'READONLY', 'HR', 'IT', 'ADMIN') NOT NULL DEFAULT 'USER';
