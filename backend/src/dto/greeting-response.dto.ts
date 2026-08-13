/**
 * Shape returned by `GET /`.
 *
 * A class rather than an interface since Feature 038, for the reason every
 * response shape in this project became one: an interface is erased at compile
 * time, and the generated documentation needs something that still exists at
 * runtime to describe. Nothing constructs it.
 */
export class GreetingResponseDto {
  /** A fixed sentence. It says the service answers, and nothing about anybody. */
  message!: string;
}
