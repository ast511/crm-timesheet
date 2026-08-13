/**
 * Shape returned by `GET /health`.
 *
 * Consumed by Docker healthchecks, monitoring probes and deployment
 * platforms — treat it as a public contract and keep it backwards compatible.
 *
 * A class rather than an interface since Feature 038, for the reason every
 * response shape in this project became one: an interface is erased at compile
 * time, and the generated documentation needs something that still exists at
 * runtime to describe. Nothing constructs it, and the contract is unchanged.
 */
export class HealthResponseDto {
  /** Always `ok` — the endpoint answering at all is the signal. */
  status!: 'ok';
  /** Which service answered, once more than one is deployed. */
  service!: string;
}
