import { Injectable } from '@nestjs/common';

import { HealthResponseDto } from './dto/health-response.dto';

/** Identifies which service answered the probe once more are deployed. */
const SERVICE_NAME = 'backend';

@Injectable()
export class HealthService {
  /**
   * Reports liveness. Dependency checks (database, cache, queues) belong here
   * as they are introduced, so the endpoint contract never has to change.
   */
  check(): HealthResponseDto {
    return { status: 'ok', service: SERVICE_NAME };
  }
}
