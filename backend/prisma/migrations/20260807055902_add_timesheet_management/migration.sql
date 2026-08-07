-- CreateEnum
CREATE TYPE "LeaveHalfDayPortion" AS ENUM ('first_half', 'second_half');

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('draft', 'submitted', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "TimesheetEntryType" AS ENUM ('work', 'leave', 'holiday');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "termination_date" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "half_day_portion" "LeaveHalfDayPortion",
ADD COLUMN     "is_half_day" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "work_schedules" ADD COLUMN     "week_starts_on" "Weekday" NOT NULL DEFAULT 'monday';

-- CreateTable
CREATE TABLE "timesheets" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_employee_id" TEXT,
    "rejection_reason" TEXT,
    "is_stale" BOOLEAN NOT NULL DEFAULT false,
    "schedule_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timesheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_entries" (
    "id" TEXT NOT NULL,
    "timesheet_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "TimesheetEntryType" NOT NULL,
    "project_id" TEXT,
    "hours" DECIMAL(5,2) NOT NULL,
    "leave_request_id" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timesheet_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timesheets_status_idx" ON "timesheets"("status");

-- CreateIndex
CREATE INDEX "timesheets_reviewed_by_employee_id_idx" ON "timesheets"("reviewed_by_employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "timesheets_employee_id_month_year_key" ON "timesheets"("employee_id", "month", "year");

-- CreateIndex
CREATE INDEX "timesheet_entries_timesheet_id_date_idx" ON "timesheet_entries"("timesheet_id", "date");

-- CreateIndex
CREATE INDEX "timesheet_entries_project_id_idx" ON "timesheet_entries"("project_id");

-- CreateIndex
CREATE INDEX "timesheet_entries_leave_request_id_idx" ON "timesheet_entries"("leave_request_id");

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_reviewed_by_employee_id_fkey" FOREIGN KEY ("reviewed_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_leave_request_id_fkey" FOREIGN KEY ("leave_request_id") REFERENCES "leave_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
