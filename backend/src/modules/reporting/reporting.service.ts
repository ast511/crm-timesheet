import { Injectable } from '@nestjs/common';

import { toIsoTimestamp } from '../../common/utils/date.util';
import { WorkScheduleService } from '../work-schedule/work-schedule.service';
import { buildAttendanceSheet } from './builders/attendance-sheet.builder';
import { buildEmployeeHoursPerProject } from './builders/employee-hours-per-project.builder';
import { buildLeaveCalendar } from './builders/leave-calendar.builder';
import {
  toProjectEmployeeHours,
  toReportedProjects,
} from './builders/project-employee-hours.aggregator';
import { buildProjectHoursPerEmployee } from './builders/project-hours-per-employee.builder';
import { buildTimesheetStatus } from './builders/timesheet-status.builder';
import { ExportQueryDto } from './dto/export-query.dto';
import { ReportQueryDto } from './dto/report-query.dto';
import { ExcelReportRenderer } from './renderers/excel.renderer';
import { PdfReportRenderer } from './renderers/pdf.renderer';
import { ReportDataModel } from './entities/report-data-model.entity';
import { ReportingSourceService } from './reporting-source.service';
import {
  REPORT_DEFINITIONS,
  ReportFormat,
  ReportType,
} from './reporting.constants';

/** A generated file, in memory, with everything the response needs. */
export interface RenderedReport {
  readonly buffer: Buffer;
  readonly filename: string;
  readonly contentType: string;
}

/** What each format is called on the wire and on disk. */
const FORMAT_DETAILS: Readonly<
  Record<ReportFormat, { contentType: string; extension: string }>
> = {
  excel: {
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  },
  pdf: { contentType: 'application/pdf', extension: 'pdf' },
};

/**
 * The reporting feature: five predefined reports, generated on demand.
 *
 * **Nothing is stored.** There is no report table, no generated file on disk and
 * no cache. Every request recomputes from live data, a preview returns the data
 * model as JSON, and an export streams a freshly generated file that is
 * discarded when the response ends. That is a deliberate design rather than a
 * simplification: a stored report is a second copy of numbers the timesheets
 * already state, and the day somebody corrects an approved month the stored copy
 * would silently disagree with the system it came from — the same argument
 * `EmployeeLeaveBalance.remainingDays` and the timesheet hour aggregates both
 * rest on.
 *
 * **Aggregate once, render three ways.** This service wires
 * sourcing → builder → renderer and does no arithmetic of its own. The source
 * service queries and classifies, one builder per report turns that into a data
 * model, and the JSON response *is* that model while the two renderers format
 * it. A number can therefore only be computed in one place, which is what makes
 * a preview and its export incapable of disagreeing.
 *
 * **Who may generate one is no longer decided here.** This service used to hold
 * an `assertReportingAccess` that admitted the three administrative roles, and
 * Feature 035 replaced it with `@RequirePermission('REPORTS.VIEW')` on the
 * controller. Every method below therefore takes no caller at all: reporting
 * reads nothing about who is asking, because the question has been answered
 * before the request reaches it. See `ReportingController` for why that check
 * moved rather than gaining a guard in front of it.
 *
 * **Generation is synchronous**, and at this scale that is the right call: a
 * month of a few dozen employees is a handful of queries and a document built in
 * well under a second, and an asynchronous pipeline would mean a job table, a
 * poll endpoint, a temporary store and signed download URLs — four moving parts
 * to remove a wait nobody notices. The population caps in
 * `ReportingSourceService` are what keep that true; the feature document records
 * the threshold beyond which the async pipeline becomes the answer.
 */
@Injectable()
export class ReportingService {
  constructor(
    private readonly source: ReportingSourceService,
    private readonly workSchedule: WorkScheduleService,
    private readonly excel: ExcelReportRenderer,
    private readonly pdf: PdfReportRenderer,
  ) {}

  /**
   * The five reports a client can ask for.
   *
   * Static metadata, computed from nothing, so rendering the menu costs no
   * query. It is behind the same gate as the reports themselves — the menu is
   * part of the administrative area, and listing documents somebody may not
   * generate would only produce five buttons that all answer `403`.
   */
  listReports(): typeof REPORT_DEFINITIONS {
    return REPORT_DEFINITIONS;
  }

  /** The report as JSON, for on-screen preview. No file is produced. */
  async preview(
    reportType: ReportType,
    query: ReportQueryDto,
  ): Promise<ReportDataModel> {
    return this.build(reportType, query);
  }

  /**
   * The same report as a file, generated in memory and streamed.
   *
   * **It regenerates from live data** and does not depend on a preview having
   * been called: the two endpoints run the identical builder over the identical
   * sources, so there is nothing to carry between them and no state to go stale
   * in the gap. A client may export without previewing, and an export taken an
   * hour after a preview reflects the hour rather than the preview.
   */
  async export(
    reportType: ReportType,
    query: ReportQueryDto,
    { format }: ExportQueryDto,
  ): Promise<RenderedReport> {
    const model = await this.build(reportType, query);
    const { contentType, extension } = FORMAT_DETAILS[format];

    return {
      buffer:
        format === 'excel'
          ? await this.excel.render(model)
          : await this.pdf.render(model),
      // `attendance-sheet_2026-09.xlsx` — the report and the period, so a folder
      // of downloads sorts and reads sensibly. The period comes from the model
      // rather than from the query, so the name can never describe a month other
      // than the one inside the file.
      filename: `${reportType}_${model.period.key}.${extension}`,
      contentType,
    };
  }

  /**
   * Resolves the sources for one report and hands them to its builder.
   *
   * The `switch` is the only place that knows which builder belongs to which
   * key, and it is exhaustive over `ReportType` — so a sixth report added to
   * `REPORT_TYPES` is a compile error here rather than a runtime fall-through.
   *
   * The two hour matrices take the same branch as far as the aggregation and
   * diverge only at the builder, which is the structural statement that they are
   * one computation rendered twice.
   */
  private async build(
    reportType: ReportType,
    query: ReportQueryDto,
  ): Promise<ReportDataModel> {
    const generatedAt = toIsoTimestamp();
    const [period, employees] = await Promise.all([
      this.source.resolvePeriod(query),
      this.source.resolveEmployees(query),
    ]);

    switch (reportType) {
      case 'project-hours-per-employee':
      case 'employee-hours-per-project': {
        const { projects, rows } = await this.source.resolveProjectHours(
          query,
          employees,
        );
        const hours = toProjectEmployeeHours(
          toReportedProjects(projects, rows),
          employees,
          rows,
        );

        return reportType === 'project-hours-per-employee'
          ? buildProjectHoursPerEmployee(period, generatedAt, hours)
          : buildEmployeeHoursPerProject(period, generatedAt, hours);
      }

      case 'timesheet-status': {
        const { months, states } = await this.source.resolveDays(
          query,
          employees,
          { includeHours: true },
        );

        return buildTimesheetStatus(period, generatedAt, months, states);
      }

      case 'attendance-sheet': {
        const [{ months }, schedule] = await Promise.all([
          this.source.resolveDays(query, employees, { includeHours: true }),
          this.workSchedule.find(),
        ]);

        return buildAttendanceSheet(period, generatedAt, months, {
          workStartTime: schedule.workStartTime,
          workEndTime: schedule.workEndTime,
        });
      }

      case 'leave-calendar': {
        // The one report that reads no timesheet, so it does not pay for the
        // per-day hours query. See the builder for why.
        const { months } = await this.source.resolveDays(query, employees, {
          includeHours: false,
        });

        return buildLeaveCalendar(period, generatedAt, months);
      }
    }
  }
}
