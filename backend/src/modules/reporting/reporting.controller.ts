import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';

import { RequirePermission } from '../authorization/decorators/require-permission.decorator';
import { ExportQueryDto } from './dto/export-query.dto';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportTypeParamsDto } from './dto/report-type-params.dto';
import { ReportDataModel } from './renderers/report-data-model';
import { REPORT_DEFINITIONS } from './reporting.constants';
import { ReportingService } from './reporting.service';

/**
 * `/api/v1/reports` — the five predefined reports. The prefix and the version
 * come from `configureApp`, so only the resource segment is declared here.
 *
 * Every method is a one-line delegation on purpose. Validation is the DTOs' job —
 * including `:reportType`, which is a validated params class so an unknown key is
 * refused with a message naming the five valid ones before any service is
 * entered. The success envelope is the global interceptor's, error rendering is
 * the global filter's, and every rule — the access check, the caps, the
 * aggregation — is the service's.
 *
 * **Every route requires `REPORTS.VIEW`, as of Feature 035** — and this is the
 * one place in that feature where an existing check was *replaced* rather than
 * layered under a gate. `ReportingService` used to carry an
 * `assertReportingAccess` that admitted the three roles in
 * `ADMINISTRATIVE_ROLES`; it is gone, and the permission is now the only control.
 *
 * Two reasons, and the second is the one that made the choice rather than merely
 * allowing it:
 *
 * 1. **The role check no longer says what the company means.** It admitted HR,
 *    because `isAdministrativeRole` is a statement about which roles administer
 *    the *system* — the same list that decides who sees the administrative
 *    notification workspace — and it was reused here for want of anything
 *    better. Whether HR should read company-wide hour matrices is a different
 *    question with a different answer, and Feature 035 settles it as no by
 *    default: `REPORTS.VIEW` sits in the `ADMIN` and `SUPERADMIN` baselines and
 *    not in HR's.
 * 2. **Because nobody yet knows whether that answer will hold.** It is entirely
 *    plausible that one HR lead will need the attendance sheet next quarter. A
 *    role restriction would make that a code change, a review and a deployment;
 *    a permission makes it a per-user `GRANT` through the permissions screen,
 *    for that one account, recorded in the audit trail with who granted it.
 *    Until somebody does that the gate behaves *identically* to the rigid check
 *    it replaced minus HR — same routes, same `403` — so the flexibility costs
 *    nothing while it is unused.
 *
 * Layering the two would have been the worse of both: the role check would have
 * kept admitting HR, so the permission could never narrow anything, and it would
 * have silently vetoed any grant an administrator made — a permission screen
 * that says "granted" over an endpoint that still refuses.
 *
 * Nothing else about access is checked anywhere in this module. The caller is
 * not read at all: see `ReportingService`.
 *
 * **`POST` for what is logically a read**, on all three generating endpoints.
 * The parameters are a body so the preview and the export take *identical*
 * input — which is what the parity guarantee rests on — and because a `GET`
 * returning a streamed attachment is the shape browsers and proxies cache most
 * eagerly, which is exactly wrong for a document regenerated from live data on
 * every request.
 */
@Controller('reports')
export class ReportingController {
  constructor(private readonly reportingService: ReportingService) {}

  /**
   * The menu: which reports exist, and what each counts.
   *
   * Static metadata, so no query runs. It is a `GET` because it genuinely reads
   * nothing and takes no parameters.
   */
  @Get()
  @RequirePermission('REPORTS.VIEW')
  findAll(): typeof REPORT_DEFINITIONS {
    return this.reportingService.listReports();
  }

  /**
   * The report as JSON — exactly the data model the two exports are rendered
   * from.
   *
   * Answers `200` rather than the `201` Nest gives a `POST` by default, because
   * nothing was created: this is a read whose parameters happen to travel in a
   * body. A `201` would tell a client a resource now exists at some location, and
   * none does.
   */
  @Post(':reportType/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('REPORTS.VIEW')
  preview(
    @Param() { reportType }: ReportTypeParamsDto,
    @Body() query: ReportQueryDto,
  ): Promise<ReportDataModel> {
    return this.reportingService.preview(reportType, query);
  }

  /**
   * The same report as a downloadable file.
   *
   * The one endpoint in this application whose response is not the
   * `{ success, data }` envelope, and it cannot be: the body is a spreadsheet or
   * a PDF. `StreamableFile` is how Nest expresses that, and the global response
   * interceptor passes it through untouched — see `ResponseInterceptor`, which
   * was taught this single exception by Feature 031.
   *
   * `@Res({ passthrough: true })` gives access to the headers while leaving Nest
   * to send the body; taking the response object outright would opt this handler
   * out of the framework's exception handling, so a failed generation would hang
   * instead of rendering the standard error envelope.
   *
   * **Nothing is written to disk.** Both renderers resolve with a `Buffer`, which
   * is streamed and then garbage-collected. No temporary file is created, so
   * there is nothing to clean up and a crashed request leaves nothing behind.
   */
  @Post(':reportType/export')
  @HttpCode(HttpStatus.OK)
  // Downloads are per-request documents built from live data. Without this a
  // browser can serve yesterday's file for today's request, which is the one
  // failure that would make a report quietly wrong.
  @Header('Cache-Control', 'no-store')
  @RequirePermission('REPORTS.VIEW')
  async exportReport(
    @Param() { reportType }: ReportTypeParamsDto,
    @Body() query: ReportQueryDto,
    @Query() exportQuery: ExportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const report = await this.reportingService.export(
      reportType,
      query,
      exportQuery,
    );

    response.setHeader('Content-Type', report.contentType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${report.filename}"`,
    );

    return new StreamableFile(report.buffer);
  }
}
