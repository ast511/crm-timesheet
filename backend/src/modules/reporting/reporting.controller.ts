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

import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
 * **The access check is not here and there is no guard.** Only administrative
 * roles may generate a report, and that is enforced in `ReportingService` as a
 * domain rule for the reason Feature 030 gives for its ownership rules: it
 * describes what a report *is*, it would be true under any permission system, and
 * authorization proper needs authentication first. See `assertReportingAccess`.
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
  findAll(@CurrentUser() user: CurrentUser): typeof REPORT_DEFINITIONS {
    return this.reportingService.listReports(user);
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
  preview(
    @CurrentUser() user: CurrentUser,
    @Param() { reportType }: ReportTypeParamsDto,
    @Body() query: ReportQueryDto,
  ): Promise<ReportDataModel> {
    return this.reportingService.preview(user, reportType, query);
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
  async exportReport(
    @CurrentUser() user: CurrentUser,
    @Param() { reportType }: ReportTypeParamsDto,
    @Body() query: ReportQueryDto,
    @Query() exportQuery: ExportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const report = await this.reportingService.export(
      user,
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
