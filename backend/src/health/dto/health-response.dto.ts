/**
 * Shape returned by `GET /health`.
 *
 * Consumed by Docker healthchecks, monitoring probes and deployment
 * platforms — treat it as a public contract and keep it backwards compatible.
 */
export interface HealthResponseDto {
  status: 'ok';
  service: string;
}
