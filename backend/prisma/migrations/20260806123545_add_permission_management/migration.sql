-- DropForeignKey
ALTER TABLE "notification_recipients" DROP CONSTRAINT "notification_recipients_employee_id_fkey";

-- DropForeignKey
ALTER TABLE "permission_audit_logs" DROP CONSTRAINT "permission_audit_logs_permission_id_fkey";

-- DropForeignKey
ALTER TABLE "permission_audit_logs" DROP CONSTRAINT "permission_audit_logs_preset_id_fkey";

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_audit_logs" ADD CONSTRAINT "permission_audit_logs_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_audit_logs" ADD CONSTRAINT "permission_audit_logs_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "permission_presets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
