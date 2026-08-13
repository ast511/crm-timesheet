import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiOkEnvelope } from '../common/swagger/api-envelope-response.decorator';
import { ApiPublicRouteErrors } from '../common/swagger/api-standard-errors.decorator';
import { API_TAG } from '../config/swagger-tags';
import { Public } from '../modules/auth/decorators/public.decorator';
import { HealthResponseDto } from './dto/health-response.dto';
import { HealthService } from './health.service';

/**
 * `@Public()` since Feature 032, and this one is not a convenience.
 *
 * A liveness probe is read by a container runtime and a load balancer, which
 * hold no credentials and restart or drain the service when the check fails. A
 * health endpoint behind authentication is an outage that begins the moment a
 * token expires, and it fails in the least recoverable direction: the probe
 * reports the service unhealthy, the orchestrator kills it, and the replacement
 * is killed for the same reason.
 */
@ApiTags(API_TAG.Service)
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'No padlock, and this one is not a convenience. A liveness probe is read by a container runtime and a load balancer, which hold no credentials and restart or drain the service when the check fails — a health endpoint behind authentication is an outage that begins the moment a token expires, and it fails in the least recoverable direction. Treat the body as a public contract and keep it backwards compatible.',
  })
  @ApiOkEnvelope(HealthResponseDto)
  @ApiPublicRouteErrors()
  @Get()
  check(): HealthResponseDto {
    return this.healthService.check();
  }
}
