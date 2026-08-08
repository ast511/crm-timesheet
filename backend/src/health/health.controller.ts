import { Controller, Get } from '@nestjs/common';

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
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): HealthResponseDto {
    return this.healthService.check();
  }
}
